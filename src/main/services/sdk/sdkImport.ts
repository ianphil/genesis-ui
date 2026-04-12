// Extracted SDK dynamic import — isolates the ESM import() hack for testability

import { app } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { getGlobalNodeModules } from './SdkDiscovery';
import {
  getLocalNodeModulesDir,
  isLocalInstallReady,
  ensureSdkInstalled,
} from './SdkBootstrap';

type SdkModule = typeof import('@github/copilot-sdk');

let cached: SdkModule | null = null;

function resolveNodeModulesDir(): string {
  if (app.isPackaged && isLocalInstallReady()) {
    return getLocalNodeModulesDir();
  }
  return getGlobalNodeModules();
}

export async function loadSdkModule(): Promise<SdkModule> {
  if (cached) return cached;
  await ensureSdkInstalled();
  const modulesDir = resolveNodeModulesDir();
  const sdkEntry = path.join(modulesDir, '@github', 'copilot-sdk', 'dist', 'index.js');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  cached = await (new Function('url', 'return import(url)')(
    pathToFileURL(sdkEntry).href
  ) as Promise<SdkModule>);
  return cached;
}

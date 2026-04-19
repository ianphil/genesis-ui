// Scanner extension adapter — loads scanner tools from a mind's .github/extensions/scanner/
// Follows the same pattern as cron.ts: dynamic ESM import of tool factories.

import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import type { LoadedExtension } from '../ExtensionLoader';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

interface ScannerToolFactory {
  [key: string]: (extDir: string, state: Record<string, unknown>) => Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
}

export async function loadScannerExtension(extDir: string): Promise<LoadedExtension> {
  const toolFile = path.join(extDir, 'tools', 'scanner-tools.mjs');
  if (!fs.existsSync(toolFile)) {
    throw new Error(`Scanner extension missing tools/scanner-tools.mjs in ${extDir}`);
  }

  const mod = await dynamicImport(pathToFileURL(toolFile).href) as ScannerToolFactory;
  const factoryName = Object.keys(mod).find((k) => k.startsWith('create') && k.endsWith('Tools'));
  if (!factoryName) {
    throw new Error('Scanner extension tools/scanner-tools.mjs must export a create*Tools function');
  }

  const tools = mod[factoryName](extDir, {});
  console.log(`[Scanner] Loaded ${tools.length} tools`);

  return {
    name: 'scanner',
    tools,
    cleanup: async () => {
      console.log('[Scanner] Cleaned up');
    },
  };
}

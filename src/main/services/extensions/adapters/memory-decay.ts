// Memory-decay extension adapter — loads 3-tier memory tools from .github/extensions/memory-decay/
// Follows the same pattern as cron.ts: dynamic ESM import of tool factories.

import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import type { LoadedExtension } from '../ExtensionLoader';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

interface MemoryToolFactory {
  [key: string]: (extDir: string, state: Record<string, unknown>) => Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }>;
}

export async function loadMemoryDecayExtension(extDir: string): Promise<LoadedExtension> {
  const toolFile = path.join(extDir, 'tools', 'memory-tools.mjs');
  if (!fs.existsSync(toolFile)) {
    throw new Error(`Memory-decay extension missing tools/memory-tools.mjs in ${extDir}`);
  }

  const mod = await dynamicImport(pathToFileURL(toolFile).href) as MemoryToolFactory;
  const factoryName = Object.keys(mod).find((k) => k.startsWith('create') && k.endsWith('Tools'));
  if (!factoryName) {
    throw new Error('Memory-decay extension tools/memory-tools.mjs must export a create*Tools function');
  }

  const tools = mod[factoryName](extDir, {});
  console.log(`[Memory] Loaded ${tools.length} tools`);

  return {
    name: 'memory-decay',
    tools,
    cleanup: async () => {
      console.log('[Memory] Cleaned up');
    },
  };
}

// Genesis IPC handlers — wire MindScaffold to renderer
import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MindManager, MindScaffold, installLensSkill, seedLensDefaults, type GenesisConfig } from '@chamber/services';

export function setupGenesisIPC(
  mindManager: MindManager,
  scaffold: MindScaffold,
): void {

  ipcMain.handle('genesis:getDefaultPath', async () => {
    return getDefaultGenesisBasePath();
  });

  ipcMain.handle('genesis:pickPath', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose where to create your agent',
      defaultPath: MindScaffold.getDefaultBasePath(),
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('genesis:create', async (event, config: GenesisConfig) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    scaffold.setProgressHandler((progress) => {
      if (win) win.webContents.send('genesis:progress', progress);
    });

    try {
      const mindPath = await scaffold.create(config);
      appendE2EGenesisMemory(mindPath);

      // Bootstrap Lens defaults
      seedLensDefaults(mindPath);
      installLensSkill(mindPath);

      // Load into MindManager (creates client, session, scans views)
      const mind = await mindManager.loadMind(mindPath);
      mindManager.setActiveMind(mind.mindId);

      return { success: true, mindId: mind.mindId, mindPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (win) win.webContents.send('genesis:progress', { step: 'error', detail: message });
      return { success: false, error: message };
    }
  });
}

function getDefaultGenesisBasePath(): string {
  if (process.env.CHAMBER_E2E === '1' && process.env.CHAMBER_E2E_GENESIS_BASE_PATH) {
    return process.env.CHAMBER_E2E_GENESIS_BASE_PATH;
  }
  return MindScaffold.getDefaultBasePath();
}

function appendE2EGenesisMemory(mindPath: string): void {
  const memoryAppend = process.env.CHAMBER_E2E_GENESIS_MEMORY_APPEND?.trim();
  if (process.env.CHAMBER_E2E !== '1' || !memoryAppend) return;

  fs.appendFileSync(path.join(mindPath, '.working-memory', 'memory.md'), `\n\n${memoryAppend}\n`, 'utf-8');
}

// Genesis IPC handlers — wire MindScaffold and TemplateInstaller to renderer
import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MindManager, MindScaffold, MarketplaceClient, TemplateInstaller, installLensSkill, seedLensDefaults, type GenesisConfig, type TemplateInstallConfig } from '@chamber/services';
import type { ConfigService } from '@chamber/services';
import type { MarketplaceListing } from '@chamber/shared/types';

const DEFAULT_MARKETPLACE_SOURCE = 'ianphil/genesis-minds';

interface TeamChatroomControl {
  setParticipants: (mindIds: string[] | null) => void;
}

export function setupGenesisIPC(
  mindManager: MindManager,
  scaffold: MindScaffold,
  installer: TemplateInstaller,
  chatroomService?: TeamChatroomControl,
  marketplace?: MarketplaceClient,
  configService?: ConfigService,
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

  ipcMain.handle('genesis:listMarketplace', async (): Promise<MarketplaceListing> => {
    const listing: MarketplaceListing = { templates: [], teams: [] };

    // Sources: default + any user-configured additional sources
    const additionalSources = configService?.load().marketplaceSources ?? [];
    const allSources = [
      { url: DEFAULT_MARKETPLACE_SOURCE, label: 'Genesis Minds' },
      ...additionalSources,
    ];

    for (const source of allSources) {
      try {
        const client = new MarketplaceClient(undefined, source.url);
        const templates = client.fetchTemplates();
        const teams = client.fetchTeams();

        listing.templates.push(...templates.map(t => ({
          id: t.id,
          name: t.name,
          role: t.role,
          description: t.description,
          tags: t.tags ?? [],
          sourceUrl: source.url,
          sourceLabel: source.label,
        })));

        listing.teams.push(...teams.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          members: t.members,
          tags: t.tags ?? [],
          sourceUrl: source.url,
          sourceLabel: source.label,
        })));
      } catch (err) {
        console.warn(`[genesis:listMarketplace] Failed to fetch from "${source.url}":`, err instanceof Error ? err.message : String(err));
      }
    }

    return listing;
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

      // Single-mind install — restore full chatroom (clear any team participant filter)
      chatroomService?.setParticipants(null);

      return { success: true, mindId: mind.mindId, mindPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (win) win.webContents.send('genesis:progress', { step: 'error', detail: message });
      return { success: false, error: message };
    }
  });

  ipcMain.handle('genesis:installTemplate', async (event, config: TemplateInstallConfig & { sourceUrl?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    // Use a source-specific installer when the template comes from a non-default marketplace
    const activeInstaller = resolveInstaller(config.sourceUrl, installer);
    activeInstaller.setProgressHandler((progress) => {
      if (win) win.webContents.send('genesis:progress', progress);
    });

    try {
      const mindPath = await activeInstaller.install(config);

      // Same post-install activation steps as genesis:create
      seedLensDefaults(mindPath);
      installLensSkill(mindPath);

      const mind = await mindManager.loadMind(mindPath);
      mindManager.setActiveMind(mind.mindId);

      // Single-mind install — restore full chatroom (clear any team participant filter)
      chatroomService?.setParticipants(null);

      return { success: true, mindId: mind.mindId, mindPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (win) win.webContents.send('genesis:progress', { step: 'error', detail: message });
      return { success: false, error: message };
    }
  });

  ipcMain.handle('genesis:installTeam', async (event, config: { teamId: string; basePath: string; sourceUrl?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    const activeMarketplace = config.sourceUrl && config.sourceUrl !== DEFAULT_MARKETPLACE_SOURCE
      ? new MarketplaceClient(undefined, config.sourceUrl)
      : marketplace;

    if (!activeMarketplace) {
      return { success: false, error: 'MarketplaceClient not available' };
    }

    const activeInstaller = resolveInstaller(config.sourceUrl, installer);
    activeInstaller.setProgressHandler((progress) => {
      if (win) win.webContents.send('genesis:progress', progress);
    });

    try {
      const teams = activeMarketplace.fetchTeams();
      const team = teams.find(t => t.id === config.teamId);
      if (!team) {
        throw new Error(`Team "${config.teamId}" not found in marketplace`);
      }

      const installedMindIds: string[] = [];

      for (const memberId of team.members) {
        const mindPath = await activeInstaller.install({ templateId: memberId, basePath: config.basePath });
        seedLensDefaults(mindPath);
        installLensSkill(mindPath);
        const mind = await mindManager.loadMind(mindPath);
        installedMindIds.push(mind.mindId);
      }

      // Restrict chatroom to this team's members.
      // Orchestration mode is intentionally left to the user — the OrchestrationPicker
      // in the chatroom UI controls how participants take turns. We only set *who* is
      // in the chatroom, not *how* they interact.
      if (chatroomService) {
        chatroomService.setParticipants(installedMindIds);
      }

      // Activate first member as the primary active mind
      if (installedMindIds.length > 0) {
        mindManager.setActiveMind(installedMindIds[0]);
      }

      return {
        success: true,
        mindIds: installedMindIds,
        welcomeMessage: team.chatroom?.welcomeMessage,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (win) win.webContents.send('genesis:progress', { step: 'error', detail: message });
      return { success: false, error: message };
    }
  });
}

/**
 * Returns an installer for the given source URL. If the source matches the
 * default marketplace (or is absent), returns the pre-wired default installer.
 * Otherwise creates a fresh installer scoped to the given source.
 */
function resolveInstaller(sourceUrl: string | undefined, defaultInstaller: TemplateInstaller): TemplateInstaller {
  if (!sourceUrl || sourceUrl === DEFAULT_MARKETPLACE_SOURCE) return defaultInstaller;
  return new TemplateInstaller(new MarketplaceClient(undefined, sourceUrl));
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

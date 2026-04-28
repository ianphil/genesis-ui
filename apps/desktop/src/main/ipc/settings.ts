// Settings IPC handlers — manage user-configurable application settings
import { ipcMain } from 'electron';
import type { ConfigService } from '@chamber/services';

/** Validates a marketplace source URL (GitHub repo slug or HTTPS URL) */
function isValidMarketplaceUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  // Accept "owner/repo" GitHub slug format
  if (/^[\w.-]+\/[\w.-]+$/.test(url.trim())) return true;
  // Accept HTTPS URLs
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function setupSettingsIPC(configService: ConfigService): void {
  ipcMain.handle('settings:getMarketplaceSources', () => {
    return configService.load().marketplaceSources;
  });

  ipcMain.handle('settings:addMarketplaceSource', (_, url: string, label?: string) => {
    const trimmed = url.trim();
    if (!isValidMarketplaceUrl(trimmed)) {
      return { success: false, error: 'Invalid URL. Use "owner/repo" or an HTTPS URL.' };
    }

    const config = configService.load();
    if (config.marketplaceSources.some(s => s.url === trimmed)) {
      return { success: false, error: 'This source is already configured.' };
    }

    configService.save({
      ...config,
      marketplaceSources: [...config.marketplaceSources, { url: trimmed, label: label?.trim() || undefined }],
    });
    return { success: true };
  });

  ipcMain.handle('settings:removeMarketplaceSource', (_, url: string) => {
    const config = configService.load();
    configService.save({
      ...config,
      marketplaceSources: config.marketplaceSources.filter(s => s.url !== url),
    });
  });
}

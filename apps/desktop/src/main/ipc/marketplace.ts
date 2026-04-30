import { ipcMain } from 'electron';
import type { MarketplaceRegistryService } from '@chamber/services';

export function setupMarketplaceIPC(marketplaceRegistryService: MarketplaceRegistryService): void {
  ipcMain.handle('marketplace:listGenesisRegistries', async () => {
    return marketplaceRegistryService.listGenesisRegistries();
  });

  ipcMain.handle('marketplace:addGenesisRegistry', async (_event, url: string) => {
    return marketplaceRegistryService.addGenesisRegistry(url);
  });
}

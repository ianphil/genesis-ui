import { ipcMain } from 'electron';
import type { MarketplaceRegistryService } from '@chamber/services';

export function setupMarketplaceIPC(marketplaceRegistryService: MarketplaceRegistryService): void {
  ipcMain.handle('marketplace:listGenesisRegistries', async () => {
    return marketplaceRegistryService.listGenesisRegistries();
  });

  ipcMain.handle('marketplace:addGenesisRegistry', async (_event, url: string) => {
    return marketplaceRegistryService.addGenesisRegistry(url);
  });

  ipcMain.handle('marketplace:refreshGenesisRegistry', async (_event, id: string) => {
    return marketplaceRegistryService.refreshGenesisRegistry(id);
  });

  ipcMain.handle('marketplace:setGenesisRegistryEnabled', async (_event, id: string, enabled: boolean) => {
    return marketplaceRegistryService.setGenesisRegistryEnabled(id, enabled);
  });

  ipcMain.handle('marketplace:removeGenesisRegistry', async (_event, id: string) => {
    return marketplaceRegistryService.removeGenesisRegistry(id);
  });
}

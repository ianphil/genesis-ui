// Auth IPC handlers
import { ipcMain, BrowserWindow, shell } from 'electron';
import { AuthService } from '../services/auth';
import type { MindManager } from '../services/mind';
import { withValidation } from './withValidation';
import {
  AuthGetStatusArgs,
  AuthListAccountsArgs,
  AuthLogoutArgs,
  AuthStartLoginArgs,
  AuthSwitchAccountArgs,
} from '../../contracts/auth';

function broadcast(
  channel: 'auth:loggedOut' | 'auth:accountSwitchStarted' | 'auth:accountSwitched',
  payload?: { login: string },
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (payload) {
      win.webContents.send(channel, payload);
      continue;
    }
    win.webContents.send(channel);
  }
}

export function setupAuthIPC(
  authService: AuthService,
  mindManager: MindManager,
): void {

  ipcMain.handle(
    'auth:getStatus',
    withValidation('auth:getStatus', AuthGetStatusArgs, async () => {
      const cred = await authService.getStoredCredential();
      return {
        authenticated: cred !== null,
        login: cred?.login,
      };
    }),
  );

  ipcMain.handle(
    'auth:listAccounts',
    withValidation('auth:listAccounts', AuthListAccountsArgs, async () => authService.listAccounts()),
  );

  ipcMain.handle(
    'auth:startLogin',
    withValidation('auth:startLogin', AuthStartLoginArgs, async (event: Electron.IpcMainInvokeEvent) => {
      const win = BrowserWindow.fromWebContents(event.sender);

      authService.setProgressHandler((progress) => {
        if (win) {
          win.webContents.send('auth:progress', progress);
        }
        if (progress.step === 'device_code' && progress.verificationUri) {
          shell.openExternal(progress.verificationUri);
        }
      });

      const result = await authService.startLogin();
      if (result.success && result.login) {
        authService.setActiveLogin(result.login);
        broadcast('auth:accountSwitchStarted', { login: result.login });
        try {
          await mindManager.reloadAllMinds();
        } catch (err) {
          console.error('[Auth] Failed to reload minds after login:', err);
        }
        broadcast('auth:accountSwitched', { login: result.login });
      }

      return result;
    }),
  );

  ipcMain.handle(
    'auth:switchAccount',
    withValidation('auth:switchAccount', AuthSwitchAccountArgs, async (_event, login) => {
      const accounts = await authService.listAccounts();
      if (!accounts.some((account) => account.login === login)) {
        throw new Error(`Account ${login} is not available`);
      }

      authService.setActiveLogin(login);
      broadcast('auth:accountSwitchStarted', { login });
      try {
        await mindManager.reloadAllMinds();
      } catch (err) {
        console.error('[Auth] Failed to reload minds after account switch:', err);
      }
      broadcast('auth:accountSwitched', { login });
    }),
  );

  ipcMain.handle(
    'auth:logout',
    withValidation('auth:logout', AuthLogoutArgs, async () => {
      await authService.logout();
      broadcast('auth:loggedOut');
    }),
  );
}

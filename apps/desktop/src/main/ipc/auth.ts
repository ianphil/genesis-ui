// Auth IPC handlers
import { ipcMain, BrowserWindow, shell } from 'electron';
import { AuthService, Logger, type MindManager } from '@chamber/services';

const log = Logger.create('Auth');

const E2E_ENABLED = process.env.CHAMBER_E2E === '1';

function broadcast(
  channel: 'auth:loggedOut' | 'auth:accountSwitchStarted' | 'auth:accountSwitched' | 'auth:progress',
  payload?: { login: string } | Record<string, unknown>,
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (payload !== undefined) {
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

  ipcMain.handle('auth:getStatus', async () => {
    const cred = await authService.getStoredCredential();
    return {
      authenticated: cred !== null,
      login: cred?.login,
    };
  });

  ipcMain.handle('auth:listAccounts', async () => authService.listAccounts());

  // E2E short-circuit: when CHAMBER_E2E=1, do not hit the real GitHub device flow.
  // Tests drive auth:progress via e2e:auth:emit-progress and resolve startLogin
  // via e2e:auth:complete-login, exercising the full renderer lifecycle without
  // a network roundtrip or external browser launch.
  let e2eStartLoginResolver: ((value: { success: boolean; login?: string }) => void) | null = null;

  ipcMain.handle('auth:startLogin', async (event) => {
    if (E2E_ENABLED) {
      // Resolve any prior pending stub before starting a new one.
      if (e2eStartLoginResolver) {
        e2eStartLoginResolver({ success: false });
        e2eStartLoginResolver = null;
      }
      const result = await new Promise<{ success: boolean; login?: string }>((resolve) => {
        e2eStartLoginResolver = resolve;
      });
      if (result.success && result.login) {
        authService.setActiveLogin(result.login);
        broadcast('auth:accountSwitchStarted', { login: result.login });
        try {
          await mindManager.reloadAllMinds();
        } catch (err) {
          log.error('Failed to reload minds after e2e login:', err);
        }
        broadcast('auth:accountSwitched', { login: result.login });
      }
      return result;
    }

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
        log.error('Failed to reload minds after login:', err);
      }
      broadcast('auth:accountSwitched', { login: result.login });
    }

    return result;
  });

  // Lets the renderer abort a pending device-code login (e.g. user cancels the
  // Add Account modal). Maps onto AuthService.abort() which trips the polling
  // loop's exit flag. In E2E mode it short-circuits the stub resolver instead.
  ipcMain.handle('auth:cancelLogin', async () => {
    if (E2E_ENABLED && e2eStartLoginResolver) {
      e2eStartLoginResolver({ success: false });
      e2eStartLoginResolver = null;
      return;
    }
    authService.abort();
  });

  ipcMain.handle('auth:switchAccount', async (_event, login: string) => {
    const accounts = await authService.listAccounts();
    if (!accounts.some((account) => account.login === login)) {
      throw new Error(`Account ${login} is not available`);
    }

    authService.setActiveLogin(login);
    broadcast('auth:accountSwitchStarted', { login });
    try {
      await mindManager.reloadAllMinds();
    } catch (err) {
      log.error('Failed to reload minds after account switch:', err);
    }
    broadcast('auth:accountSwitched', { login });
  });

  ipcMain.handle('auth:logout', async () => {
    await authService.logout();
    broadcast('auth:loggedOut');
  });

  // Test-only handlers — gated on CHAMBER_E2E=1 so they are never registered
  // in production builds. Mirrors the existing e2e:a2a:incoming pattern.
  if (E2E_ENABLED) {
    ipcMain.handle('e2e:auth:emit-progress', async (_event, payload: Record<string, unknown>) => {
      broadcast('auth:progress', payload);
    });

    ipcMain.handle('e2e:auth:complete-login', async (_event, payload: { success?: boolean; login?: string }) => {
      const resolver = e2eStartLoginResolver;
      e2eStartLoginResolver = null;
      if (resolver) {
        resolver({ success: payload?.success ?? true, login: payload?.login });
      }
    });
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn().mockReturnValue([]) },
  shell: { openExternal: vi.fn() },
  app: { isPackaged: false },
}));

import { ipcMain, BrowserWindow } from 'electron';
import { setupAuthIPC } from './auth';
import type { AuthService, MindManager } from '@chamber/services';

function createFakeAuth() {
  return {
    getStoredCredential: vi.fn().mockResolvedValue(null),
    listAccounts: vi.fn().mockResolvedValue([]),
    setProgressHandler: vi.fn(),
    startLogin: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    setActiveLogin: vi.fn(),
    abort: vi.fn(),
  } as unknown as AuthService;
}

function createFakeMindManager() {
  return {
    reloadAllMinds: vi.fn().mockResolvedValue(undefined),
  } as unknown as MindManager;
}

describe('setupAuthIPC', () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear();
  });

  it('registers all auth handlers', () => {
    setupAuthIPC(createFakeAuth(), createFakeMindManager());
    const channels = vi.mocked(ipcMain.handle).mock.calls.map(c => c[0]);
    expect(channels).toContain('auth:getStatus');
    expect(channels).toContain('auth:listAccounts');
    expect(channels).toContain('auth:startLogin');
    expect(channels).toContain('auth:switchAccount');
    expect(channels).toContain('auth:logout');
  });

  it('auth:listAccounts returns authService.listAccounts()', async () => {
    const fakeAuth = createFakeAuth();
    fakeAuth.listAccounts = vi.fn().mockResolvedValue([{ login: 'alice' }]);

    setupAuthIPC(fakeAuth, createFakeMindManager());

    const listCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:listAccounts');
    await expect(listCall![1]({} as never, ...([] as unknown[]))).resolves.toEqual([{ login: 'alice' }]);
  });

  it('auth:switchAccount sets activeLogin via authService, reloads minds, and broadcasts accountSwitched', async () => {
    const fakeAuth = createFakeAuth();
    const fakeMindManager = createFakeMindManager();
    fakeAuth.listAccounts = vi.fn().mockResolvedValue([{ login: 'alice' }, { login: 'bob' }]);

    const mockSend = vi.fn();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{ webContents: { send: mockSend } }] as never);

    setupAuthIPC(fakeAuth, fakeMindManager);

    const switchCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:switchAccount');
    await switchCall![1]({} as never, 'bob');

    expect(fakeAuth.setActiveLogin).toHaveBeenCalledWith('bob');
    expect(fakeMindManager.reloadAllMinds).toHaveBeenCalled();
    expect(mockSend).toHaveBeenNthCalledWith(1, 'auth:accountSwitchStarted', { login: 'bob' });
    expect(mockSend).toHaveBeenNthCalledWith(2, 'auth:accountSwitched', { login: 'bob' });
  });

  it('auth:switchAccount rejects when account is missing', async () => {
    const fakeAuth = createFakeAuth();
    fakeAuth.listAccounts = vi.fn().mockResolvedValue([{ login: 'alice' }]);

    setupAuthIPC(fakeAuth, createFakeMindManager());

    const switchCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:switchAccount');
    await expect(switchCall![1]({} as never, 'bob')).rejects.toThrow('Account bob is not available');
  });

  it('auth:startLogin sets activeLogin via authService, reloads minds, and broadcasts accountSwitched after success', async () => {
    const fakeAuth = createFakeAuth();
    const fakeMindManager = createFakeMindManager();
    fakeAuth.startLogin = vi.fn().mockResolvedValue({ success: true, login: 'alice' });

    const mockSend = vi.fn();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ webContents: { send: mockSend } } as never);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{ webContents: { send: mockSend } }] as never);

    setupAuthIPC(fakeAuth, fakeMindManager);

    const startLoginCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:startLogin');
    await expect(startLoginCall![1]({ sender: {} } as never, ...([] as unknown[]))).resolves.toEqual({ success: true, login: 'alice' });

    expect(fakeAuth.setActiveLogin).toHaveBeenCalledWith('alice');
    expect(fakeMindManager.reloadAllMinds).toHaveBeenCalled();
    expect(mockSend).toHaveBeenNthCalledWith(1, 'auth:accountSwitchStarted', { login: 'alice' });
    expect(mockSend).toHaveBeenNthCalledWith(2, 'auth:accountSwitched', { login: 'alice' });
  });

  it('auth:switchAccount still broadcasts accountSwitched when reloadAllMinds rejects', async () => {
    const fakeAuth = createFakeAuth();
    const fakeMindManager = createFakeMindManager();
    fakeMindManager.reloadAllMinds = vi.fn().mockRejectedValue(new Error('disk failure')) as never;
    fakeAuth.listAccounts = vi.fn().mockResolvedValue([{ login: 'alice' }]);

    const mockSend = vi.fn();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{ webContents: { send: mockSend } }] as never);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    setupAuthIPC(fakeAuth, fakeMindManager);

    const switchCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:switchAccount');
    await switchCall![1]({} as never, 'alice');

    expect(mockSend).toHaveBeenCalledWith('auth:accountSwitched', { login: 'alice' });
    consoleSpy.mockRestore();
  });

  it('auth:logout handler calls authService.logout and broadcasts to all windows', async () => {
    const fakeAuth = createFakeAuth();
    const mockSend = vi.fn();
    const mockWindows = [
      { webContents: { send: mockSend } },
      { webContents: { send: mockSend } },
    ];
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue(mockWindows as never);

    setupAuthIPC(fakeAuth, createFakeMindManager());

    // Find and invoke the auth:logout handler
    const logoutCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:logout');
    expect(logoutCall).toBeDefined();
    await logoutCall![1]({} as never, ...([] as unknown[]));

    expect(fakeAuth.logout).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith('auth:loggedOut');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('BVT-13: auth:cancelLogin handler calls authService.abort()', async () => {
    const fakeAuth = createFakeAuth();
    setupAuthIPC(fakeAuth, createFakeMindManager());

    const cancelCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:cancelLogin');
    expect(cancelCall).toBeDefined();
    await cancelCall![1]({} as never, ...([] as unknown[]));
    expect(fakeAuth.abort).toHaveBeenCalled();
  });

  it('BVT-14: e2e:auth handlers are NOT registered when CHAMBER_E2E is unset', async () => {
    const original = process.env.CHAMBER_E2E;
    delete process.env.CHAMBER_E2E;
    try {
      vi.resetModules();
      vi.mocked(ipcMain.handle).mockClear();
      const mod = await import('./auth');
      mod.setupAuthIPC(createFakeAuth(), createFakeMindManager());

      const channels = vi.mocked(ipcMain.handle).mock.calls.map(c => c[0]);
      expect(channels).not.toContain('e2e:auth:emit-progress');
      expect(channels).not.toContain('e2e:auth:complete-login');
      expect(channels).toContain('auth:cancelLogin');
    } finally {
      if (original !== undefined) {
        process.env.CHAMBER_E2E = original;
      }
    }
  });

  it('BVT-15: when CHAMBER_E2E=1, e2e:auth:emit-progress broadcasts auth:progress to all windows', async () => {
    const original = process.env.CHAMBER_E2E;
    process.env.CHAMBER_E2E = '1';
    try {
      vi.resetModules();
      vi.mocked(ipcMain.handle).mockClear();
      const mockSend = vi.fn();
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
        { webContents: { send: mockSend } },
        { webContents: { send: mockSend } },
      ] as never);

      const mod = await import('./auth');
      mod.setupAuthIPC(createFakeAuth(), createFakeMindManager());

      const emitCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'e2e:auth:emit-progress');
      expect(emitCall).toBeDefined();
      await emitCall![1]({} as never, { step: 'device_code', userCode: 'TEST-1234' });

      expect(mockSend).toHaveBeenCalledWith('auth:progress', { step: 'device_code', userCode: 'TEST-1234' });
      expect(mockSend).toHaveBeenCalledTimes(2);
    } finally {
      if (original === undefined) {
        delete process.env.CHAMBER_E2E;
      } else {
        process.env.CHAMBER_E2E = original;
      }
    }
  });

  it('BVT-16: when CHAMBER_E2E=1, auth:startLogin does NOT call authService.startLogin and resolves via complete-login stub', async () => {
    const original = process.env.CHAMBER_E2E;
    process.env.CHAMBER_E2E = '1';
    try {
      vi.resetModules();
      vi.mocked(ipcMain.handle).mockClear();

      const fakeAuth = createFakeAuth();
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([] as never);

      const mod = await import('./auth');
      mod.setupAuthIPC(fakeAuth, createFakeMindManager());

      const startCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'auth:startLogin');
      const completeCall = vi.mocked(ipcMain.handle).mock.calls.find(c => c[0] === 'e2e:auth:complete-login');
      expect(startCall).toBeDefined();
      expect(completeCall).toBeDefined();

      // Begin a stubbed login — this returns a pending promise until complete is invoked.
      const pending = startCall![1]({ sender: {} } as never, ...([] as unknown[])) as Promise<{ success: boolean; login?: string }>;

      // Complete the stub — should resolve the awaiting promise with the supplied payload.
      await completeCall![1]({} as never, { success: true, login: 'e2e-user' });
      const result = await pending;

      expect(fakeAuth.startLogin).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, login: 'e2e-user' });
      expect(fakeAuth.setActiveLogin).toHaveBeenCalledWith('e2e-user');
    } finally {
      if (original === undefined) {
        delete process.env.CHAMBER_E2E;
      } else {
        process.env.CHAMBER_E2E = original;
      }
    }
  });
});

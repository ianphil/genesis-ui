import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn().mockReturnValue(null) },
}));

import { ipcMain, BrowserWindow } from 'electron';
import { setupChatIPC } from './chat';
import { IpcValidationError } from '../../contracts/errors';
import type { ChatService } from '../services/chat/ChatService';
import type { MindManager } from '../services/mind';

function fakeChatService() {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockResolvedValue([{ id: 'gpt-5', name: 'GPT-5' }]),
    cancelMessage: vi.fn().mockResolvedValue(undefined),
    newConversation: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatService;
}

function fakeMindManager() {
  return {
    getActiveMindId: vi.fn().mockReturnValue('m1'),
    listMinds: vi.fn().mockReturnValue([{ mindId: 'm1' }]),
  } as unknown as MindManager;
}

function getHandler(channel: string): (event: unknown, ...args: unknown[]) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel);
  if (!call) throw new Error(`handler not registered: ${channel}`);
  return call[1] as (event: unknown, ...args: unknown[]) => unknown;
}

describe('setupChatIPC — validation', () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear();
  });

  it('registers all chat handlers', () => {
    setupChatIPC(fakeChatService(), fakeMindManager());
    const channels = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0]);
    expect(channels).toEqual(
      expect.arrayContaining(['chat:send', 'chat:stop', 'chat:newConversation', 'chat:listModels']),
    );
  });

  it('chat:send rejects with IpcValidationError on bad args', async () => {
    const svc = fakeChatService();
    setupChatIPC(svc, fakeMindManager());
    const handler = getHandler('chat:send');
    await expect(
      handler({ sender: {} }, '', 'hello', 'msg1'),
    ).rejects.toBeInstanceOf(IpcValidationError);
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it('chat:send invokes service on valid args', async () => {
    const svc = fakeChatService();
    const fakeWin = { webContents: { send: vi.fn() } } as unknown as Electron.BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(fakeWin);
    setupChatIPC(svc, fakeMindManager());
    const handler = getHandler('chat:send');
    await handler({ sender: {} }, 'm1', 'hi', 'msg1');
    expect(svc.sendMessage).toHaveBeenCalledTimes(1);
    expect(svc.sendMessage).toHaveBeenCalledWith(
      'm1',
      'hi',
      'msg1',
      expect.any(Function),
      undefined,
    );
  });

  it('chat:stop rejects invalid args', async () => {
    const svc = fakeChatService();
    setupChatIPC(svc, fakeMindManager());
    const handler = getHandler('chat:stop');
    await expect(handler({ sender: {} }, 'm1')).rejects.toBeInstanceOf(IpcValidationError);
    expect(svc.cancelMessage).not.toHaveBeenCalled();
  });

  it('chat:newConversation rejects empty mindId', async () => {
    const svc = fakeChatService();
    setupChatIPC(svc, fakeMindManager());
    const handler = getHandler('chat:newConversation');
    await expect(handler({ sender: {} }, '')).rejects.toBeInstanceOf(IpcValidationError);
    expect(svc.newConversation).not.toHaveBeenCalled();
  });

  it('chat:listModels accepts no args (falls back to active mind)', async () => {
    const svc = fakeChatService();
    const mgr = fakeMindManager();
    setupChatIPC(svc, mgr);
    const handler = getHandler('chat:listModels');
    const result = await handler({ sender: {} });
    expect(result).toEqual([{ id: 'gpt-5', name: 'GPT-5' }]);
    expect(svc.listModels).toHaveBeenCalledWith('m1');
  });

  it('chat:listModels rejects non-string mindId', async () => {
    const svc = fakeChatService();
    setupChatIPC(svc, fakeMindManager());
    const handler = getHandler('chat:listModels');
    await expect(handler({ sender: {} }, 42)).rejects.toBeInstanceOf(IpcValidationError);
  });
});

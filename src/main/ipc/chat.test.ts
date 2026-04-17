import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn().mockReturnValue(null) },
}));

import { ipcMain, BrowserWindow } from 'electron';
import { setupChatIPC } from './chat';
import { Dispatcher } from '../rpc/dispatcher';
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

function setup(svc: ChatService = fakeChatService(), mgr: MindManager = fakeMindManager()) {
  const dispatcher = new Dispatcher();
  setupChatIPC(dispatcher, svc, mgr);
  return { dispatcher, svc, mgr };
}

describe('setupChatIPC — validation', () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null);
  });

  it('registers all chat handlers', () => {
    setup();
    const channels = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0]);
    expect(channels).toEqual(
      expect.arrayContaining(['chat:send', 'chat:stop', 'chat:newConversation', 'chat:listModels']),
    );
  });

  it('chat:send rejects with IpcValidationError on bad args', async () => {
    const { svc } = setup();
    const handler = getHandler('chat:send');
    await expect(
      handler({ sender: {} }, '', 'hello', 'msg1'),
    ).rejects.toBeInstanceOf(IpcValidationError);
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it('chat:send invokes service on valid args and emits chat:event in positional form', async () => {
    const svc = fakeChatService();
    const sent: unknown[][] = [];
    const fakeWin = {
      isDestroyed: () => false,
      webContents: {
        send: (...args: unknown[]) => {
          sent.push(args);
        },
      },
    } as unknown as Electron.BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(fakeWin);
    // Capture the emit callback that ChatService receives so we can drive a push.
    vi.mocked(svc.sendMessage).mockImplementation(
      async (_mindId, _msg, _msgId, emit) => {
        emit({ type: 'done' });
      },
    );

    setup(svc);
    const handler = getHandler('chat:send');
    await handler({ sender: {} }, 'm1', 'hi', 'msg1');

    expect(svc.sendMessage).toHaveBeenCalledWith(
      'm1',
      'hi',
      'msg1',
      expect.any(Function),
      undefined,
    );
    // Renderer wire format must stay positional: (channel, mindId, messageId, event)
    expect(sent).toEqual([['chat:event', 'm1', 'msg1', { type: 'done' }]]);
  });

  it('chat:stop rejects invalid args', async () => {
    const { svc } = setup();
    const handler = getHandler('chat:stop');
    await expect(handler({ sender: {} }, 'm1')).rejects.toBeInstanceOf(IpcValidationError);
    expect(svc.cancelMessage).not.toHaveBeenCalled();
  });

  it('chat:stop emits done event via reply.emit in positional form', async () => {
    const svc = fakeChatService();
    const sent: unknown[][] = [];
    const fakeWin = {
      isDestroyed: () => false,
      webContents: {
        send: (...args: unknown[]) => {
          sent.push(args);
        },
      },
    } as unknown as Electron.BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(fakeWin);
    setup(svc);
    const handler = getHandler('chat:stop');
    await handler({ sender: {} }, 'm1', 'msg1');
    expect(svc.cancelMessage).toHaveBeenCalledWith('m1', 'msg1');
    expect(sent).toEqual([['chat:event', 'm1', 'msg1', { type: 'done' }]]);
  });

  it('chat:newConversation rejects empty mindId', async () => {
    const { svc } = setup();
    const handler = getHandler('chat:newConversation');
    await expect(handler({ sender: {} }, '')).rejects.toBeInstanceOf(IpcValidationError);
    expect(svc.newConversation).not.toHaveBeenCalled();
  });

  it('chat:listModels accepts no args (falls back to active mind)', async () => {
    const svc = fakeChatService();
    const mgr = fakeMindManager();
    setup(svc, mgr);
    const handler = getHandler('chat:listModels');
    const result = await handler({ sender: {} });
    expect(result).toEqual([{ id: 'gpt-5', name: 'GPT-5' }]);
    expect(svc.listModels).toHaveBeenCalledWith('m1');
  });

  it('chat:listModels rejects non-string mindId', async () => {
    setup();
    const handler = getHandler('chat:listModels');
    await expect(handler({ sender: {} }, 42)).rejects.toBeInstanceOf(IpcValidationError);
  });
});

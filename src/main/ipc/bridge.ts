// Generic IPC bridge: translates an Electron IpcMainInvokeEvent into an
// InvocationCtx and forwards to the Dispatcher. Every domain adapter under
// src/main/ipc/ uses this helper so there is one definition of "how IPC
// becomes a dispatcher call" in the codebase.
//
// For server-initiated pushes (caller-scope vs broadcast), see PushBus.
import { BrowserWindow } from 'electron';
import type { Dispatcher, InvocationCtx } from '../rpc/dispatcher';
import { getOutboundEntry, translateForIpc } from '../rpc/outboundRegistry';

export type IpcBridge = (
  event: Electron.IpcMainInvokeEvent,
  ...args: unknown[]
) => Promise<unknown>;

export function makeIpcBridge(dispatcher: Dispatcher, channel: string): IpcBridge {
  return async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const ctx: InvocationCtx = {
      reply: {
        emit(replyChannel, payload) {
          // Only translate channels the outbound registry knows about.
          // Unknown channels would be a programmer error; surface it loudly.
          if (!getOutboundEntry(replyChannel)) {
            throw new Error(
              `[ipcBridge] emit for unregistered outbound channel: ${replyChannel}`,
            );
          }
          if (!win || win.isDestroyed()) return;
          const ipcArgs = translateForIpc(replyChannel, payload);
          win.webContents.send(replyChannel, ...ipcArgs);
        },
      },
      senderHandle: event.sender,
      transport: 'ipc',
    };
    return dispatcher.invoke(channel, args, ctx);
  };
}

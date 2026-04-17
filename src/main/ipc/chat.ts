// Chat IPC adapter — thin bridge from ipcMain to the Dispatcher.
// The actual chat handlers live in src/main/rpc/handlers/chat.ts so they
// can be served over WS in the future without being rewritten.
import { ipcMain } from 'electron';
import type { ChatService } from '../services/chat/ChatService';
import type { MindManager } from '../services/mind';
import type { Dispatcher } from '../rpc/dispatcher';
import { registerChatHandlers, CHAT_CHANNELS } from '../rpc/handlers/chat';
import { makeIpcBridge } from './bridge';

export function setupChatIPC(
  dispatcher: Dispatcher,
  chatService: ChatService,
  mindManager: MindManager,
): void {
  registerChatHandlers(dispatcher, chatService, mindManager);
  for (const channel of CHAT_CHANNELS) {
    ipcMain.handle(channel, makeIpcBridge(dispatcher, channel));
  }
}


// Chat IPC handlers — thin adapters for ChatService
import { ipcMain, BrowserWindow } from 'electron';
import type { ChatService } from '../services/chat/ChatService';
import type { MindManager } from '../services/mind';
import type { ChatEvent } from '../../shared/types';
import { withValidation } from './withValidation';
import {
  ChatListModelsArgs,
  ChatNewConversationArgs,
  ChatSendArgs,
  ChatStopArgs,
} from '../../contracts/chat';

export function setupChatIPC(chatService: ChatService, mindManager: MindManager): void {
  ipcMain.handle(
    'chat:send',
    withValidation(
      'chat:send',
      ChatSendArgs,
      async (event: Electron.IpcMainInvokeEvent, mindId, message, messageId, model) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        const emit = (evt: ChatEvent) => win.webContents.send('chat:event', mindId, messageId, evt);
        await chatService.sendMessage(mindId, message, messageId, emit, model);
      },
    ),
  );

  ipcMain.handle(
    'chat:listModels',
    withValidation(
      'chat:listModels',
      ChatListModelsArgs,
      async (_event: Electron.IpcMainInvokeEvent, mindId) => {
        const id = mindId ?? mindManager.getActiveMindId() ?? mindManager.listMinds()[0]?.mindId;
        if (!id) return [];
        return chatService.listModels(id);
      },
    ),
  );

  ipcMain.handle(
    'chat:stop',
    withValidation(
      'chat:stop',
      ChatStopArgs,
      async (event: Electron.IpcMainInvokeEvent, mindId, messageId) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        await chatService.cancelMessage(mindId, messageId);
        if (win) win.webContents.send('chat:event', mindId, messageId, { type: 'done' });
      },
    ),
  );

  ipcMain.handle(
    'chat:newConversation',
    withValidation(
      'chat:newConversation',
      ChatNewConversationArgs,
      async (_event: Electron.IpcMainInvokeEvent, mindId) => {
        await chatService.newConversation(mindId);
      },
    ),
  );
}

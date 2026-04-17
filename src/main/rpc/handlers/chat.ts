import type { Dispatcher } from '../dispatcher';
import type { ChatService } from '../../services/chat/ChatService';
import type { MindManager } from '../../services/mind';
import type { ChatEvent } from '../../../shared/types';
import {
  ChatListModelsArgs,
  ChatNewConversationArgs,
  ChatSendArgs,
  ChatStopArgs,
} from '../../../contracts/chat';

export const CHAT_CHANNELS = [
  'chat:send',
  'chat:stop',
  'chat:newConversation',
  'chat:listModels',
] as const;

/**
 * Transport-agnostic chat handlers.
 *
 * Outbound `chat:event` is caller-scoped (via `ctx.reply.emit`) — chat
 * streaming belongs to the window that issued the request, not a broadcast.
 */
export function registerChatHandlers(
  dispatcher: Dispatcher,
  chatService: ChatService,
  mindManager: MindManager,
): void {
  dispatcher.register(
    'chat:send',
    ChatSendArgs,
    async ([mindId, message, messageId, model], ctx) => {
      const emit = (event: ChatEvent) =>
        ctx.reply.emit('chat:event', { mindId, messageId, event });
      await chatService.sendMessage(mindId, message, messageId, emit, model);
    },
  );

  dispatcher.register('chat:stop', ChatStopArgs, async ([mindId, messageId], ctx) => {
    await chatService.cancelMessage(mindId, messageId);
    ctx.reply.emit('chat:event', { mindId, messageId, event: { type: 'done' } });
  });

  dispatcher.register('chat:newConversation', ChatNewConversationArgs, async ([mindId]) => {
    await chatService.newConversation(mindId);
  });

  dispatcher.register('chat:listModels', ChatListModelsArgs, async ([mindId]) => {
    const id = mindId ?? mindManager.getActiveMindId() ?? mindManager.listMinds()[0]?.mindId;
    if (!id) return [];
    return chatService.listModels(id);
  });
}

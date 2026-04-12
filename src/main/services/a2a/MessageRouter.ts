import { EventEmitter } from 'events';
import type { SendMessageRequest, SendMessageResponse, Message } from './types';
import type { AgentCardRegistry } from './AgentCardRegistry';
import type { ChatService } from '../chat/ChatService';
import { generateMessageId, generateContextId, serializeMessageToXml } from './helpers';

const MAX_HOPS = 5;

export class MessageRouter extends EventEmitter {
  constructor(
    private readonly chatService: ChatService,
    private readonly registry: AgentCardRegistry,
    private readonly ipcEmitter: EventEmitter,
  ) {
    super();
  }

  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    // 1. Resolve recipient — try by mindId first, then by name
    const card = this.registry.getCard(request.recipient) ?? this.registry.getCardByName(request.recipient);
    if (!card?.mindId) {
      throw new Error(`Unknown recipient: ${request.recipient}`);
    }
    const targetMindId = card.mindId;

    // 2. Validate hop count
    const hopCount = (request.message.metadata?.hopCount as number) ?? 0;
    if (hopCount > MAX_HOPS) {
      throw new Error(`Message exceeded maximum hop count (${MAX_HOPS})`);
    }

    // 3. Assign/preserve contextId
    const contextId = request.message.contextId || generateContextId();

    // 4. Build the delivery message (with incremented hop count)
    const deliveryMessage: Message = {
      ...request.message,
      contextId,
      metadata: {
        ...request.message.metadata,
        hopCount: hopCount + 1,
      },
    };

    // 5. Serialize to XML for model injection
    const xmlPrompt = serializeMessageToXml(deliveryMessage);
    const replyMessageId = generateMessageId();

    // 6. Emit a2a:incoming for renderer (before delivery)
    this.ipcEmitter.emit('a2a:incoming', {
      targetMindId,
      message: deliveryMessage,
      replyMessageId,
    });

    // 7. Deliver via ChatService — emit callback forwards events via IPC bus
    const returnImmediately = request.configuration?.returnImmediately !== false;
    const deliveryPromise = this.chatService.sendMessage(
      targetMindId,
      xmlPrompt,
      replyMessageId,
      (event) => {
        this.ipcEmitter.emit('a2a:chat-event', {
          mindId: targetMindId,
          messageId: replyMessageId,
          event,
        });
      },
    );

    if (!returnImmediately) {
      await deliveryPromise;
    }

    // 8. Return response
    return {
      message: {
        ...deliveryMessage,
        contextId,
      },
    };
  }
}

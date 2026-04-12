import type { MessageRouter } from './MessageRouter';
import type { AgentCardRegistry } from './AgentCardRegistry';
import { createTextMessage } from './helpers';

interface SessionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function buildSessionTools(
  mindId: string,
  extensionTools: SessionTool[],
  messageRouter: MessageRouter,
  agentCardRegistry: AgentCardRegistry,
): SessionTool[] {
  const sendMessage: SessionTool = {
    name: 'a2a_send_message',
    description:
      'Send an A2A message to another agent loaded in Chamber. The message is delivered asynchronously — you will not receive the response. Use a2a_list_agents first to discover available agents.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'The mindId or name of the target agent' },
        message: { type: 'string', description: 'The message content to send' },
        context_id: {
          type: 'string',
          description: 'Optional context ID to continue an existing conversation',
        },
      },
      required: ['recipient', 'message'],
    },
    handler: async (args) => {
      const { recipient, message: text, context_id } = args as {
        recipient: string;
        message: string;
        context_id?: string;
      };
      const a2aMessage = createTextMessage(mindId, text, {
        contextId: context_id,
        hopCount: 0,
      });
      const response = await messageRouter.sendMessage({
        recipient,
        message: a2aMessage,
        configuration: { returnImmediately: true },
      });
      return response;
    },
  };

  const listAgents: SessionTool = {
    name: 'a2a_list_agents',
    description:
      'List all available agents loaded in Chamber that you can communicate with via a2a_send_message, including their capabilities and skills.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      return agentCardRegistry.getCards().filter((c) => c.mindId !== mindId);
    },
  };

  return [...extensionTools, sendMessage, listAgents];
}

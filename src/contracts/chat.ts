import { z } from 'zod';
import { MessageIdSchema, MindIdSchema } from './primitives';

export { ChatEventSchema, type ChatEvent } from './chatEvent';
export {
  ContentBlockSchema,
  TextBlockSchema,
  ToolCallBlockSchema,
  ReasoningBlockSchema,
  type ContentBlock,
  type TextBlock,
  type ToolCallBlock,
  type ReasoningBlock,
} from './blocks';

export const ModelInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/** `chat:send` — [mindId, message, messageId, model?] */
export const ChatSendArgs = z.tuple([
  MindIdSchema,
  z.string().min(1),
  MessageIdSchema,
  z.string().min(1).optional(),
]);
export type ChatSendArgsT = z.infer<typeof ChatSendArgs>;

/** `chat:stop` — [mindId, messageId] */
export const ChatStopArgs = z.tuple([MindIdSchema, MessageIdSchema]);
export type ChatStopArgsT = z.infer<typeof ChatStopArgs>;

/** `chat:newConversation` — [mindId] */
export const ChatNewConversationArgs = z.tuple([MindIdSchema]);
export type ChatNewConversationArgsT = z.infer<typeof ChatNewConversationArgs>;

/** `chat:listModels` — [] | [mindId] */
export const ChatListModelsArgs = z.tuple([MindIdSchema.optional()]);
export type ChatListModelsArgsT = z.infer<typeof ChatListModelsArgs>;

export const ChatListModelsResponse = z.array(ModelInfoSchema);
export type ChatListModelsResponseT = z.infer<typeof ChatListModelsResponse>;

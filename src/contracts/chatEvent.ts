import { z } from 'zod';
import {
  JsonRecordSchema,
  ReasoningIdSchema,
  SdkMessageIdSchema,
  ToolCallIdSchema,
} from './primitives';

export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chunk'),
    sdkMessageId: SdkMessageIdSchema.optional(),
    content: z.string(),
  }),
  z.object({
    type: z.literal('tool_start'),
    toolCallId: ToolCallIdSchema,
    toolName: z.string().min(1),
    args: JsonRecordSchema.optional(),
    parentToolCallId: ToolCallIdSchema.optional(),
  }),
  z.object({
    type: z.literal('tool_progress'),
    toolCallId: ToolCallIdSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal('tool_output'),
    toolCallId: ToolCallIdSchema,
    output: z.string(),
  }),
  z.object({
    type: z.literal('tool_done'),
    toolCallId: ToolCallIdSchema,
    success: z.boolean(),
    result: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('reasoning'),
    reasoningId: ReasoningIdSchema,
    content: z.string(),
  }),
  z.object({
    type: z.literal('message_final'),
    sdkMessageId: SdkMessageIdSchema,
    content: z.string(),
  }),
  z.object({ type: z.literal('reconnecting') }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type ChatEvent = z.infer<typeof ChatEventSchema>;

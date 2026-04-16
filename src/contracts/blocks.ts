import { z } from 'zod';
import {
  JsonRecordSchema,
  ReasoningIdSchema,
  SdkMessageIdSchema,
  ToolCallIdSchema,
} from './primitives';

export const TextBlockSchema = z.object({
  type: z.literal('text'),
  sdkMessageId: SdkMessageIdSchema.optional(),
  content: z.string(),
});

export const ToolCallBlockSchema = z.object({
  type: z.literal('tool_call'),
  toolCallId: ToolCallIdSchema,
  toolName: z.string().min(1),
  status: z.enum(['running', 'done', 'error']),
  arguments: JsonRecordSchema.optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  parentToolCallId: ToolCallIdSchema.optional(),
});

export const ReasoningBlockSchema = z.object({
  type: z.literal('reasoning'),
  reasoningId: ReasoningIdSchema,
  content: z.string(),
});

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ToolCallBlockSchema,
  ReasoningBlockSchema,
]);

export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ToolCallBlock = z.infer<typeof ToolCallBlockSchema>;
export type ReasoningBlock = z.infer<typeof ReasoningBlockSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

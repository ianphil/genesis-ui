import { z } from 'zod';

/** Opaque string identifiers used across IPC surfaces. */
export const MindIdSchema = z.string().min(1);
export const MessageIdSchema = z.string().min(1);
export const ToolCallIdSchema = z.string().min(1);
export const ReasoningIdSchema = z.string().min(1);
export const ViewIdSchema = z.string().min(1);
export const SdkMessageIdSchema = z.string().min(1);

export type MindId = z.infer<typeof MindIdSchema>;
export type MessageId = z.infer<typeof MessageIdSchema>;
export type ToolCallId = z.infer<typeof ToolCallIdSchema>;
export type ReasoningId = z.infer<typeof ReasoningIdSchema>;
export type ViewId = z.infer<typeof ViewIdSchema>;
export type SdkMessageId = z.infer<typeof SdkMessageIdSchema>;

/** Arbitrary JSON-ish record used for tool args / view data passthrough. */
export const JsonRecordSchema = z.record(z.string(), z.unknown());
export type JsonRecord = z.infer<typeof JsonRecordSchema>;

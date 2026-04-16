import { describe, it, expect } from 'vitest';
import {
  ChatSendArgs,
  ChatStopArgs,
  ChatNewConversationArgs,
  ChatListModelsArgs,
  ModelInfoSchema,
  ChatEventSchema,
  ContentBlockSchema,
} from './chat';

describe('chat contract', () => {
  describe('ChatSendArgs', () => {
    it('accepts [mindId, message, messageId] and [mindId, message, messageId, model]', () => {
      expect(ChatSendArgs.safeParse(['m1', 'hi', 'msg1']).success).toBe(true);
      expect(ChatSendArgs.safeParse(['m1', 'hi', 'msg1', 'gpt-5']).success).toBe(true);
    });

    it('rejects empty mindId / messageId / message', () => {
      expect(ChatSendArgs.safeParse(['', 'hi', 'msg1']).success).toBe(false);
      expect(ChatSendArgs.safeParse(['m1', 'hi', '']).success).toBe(false);
    });

    it('rejects non-string args', () => {
      expect(ChatSendArgs.safeParse([123, 'hi', 'msg1']).success).toBe(false);
      expect(ChatSendArgs.safeParse(['m1', 42, 'msg1']).success).toBe(false);
    });

    it('rejects arity mismatch', () => {
      expect(ChatSendArgs.safeParse(['m1', 'hi']).success).toBe(false);
      expect(ChatSendArgs.safeParse(['m1', 'hi', 'msg1', 'gpt-5', 'extra']).success).toBe(false);
    });
  });

  describe('ChatStopArgs', () => {
    it('accepts [mindId, messageId]', () => {
      expect(ChatStopArgs.safeParse(['m1', 'msg1']).success).toBe(true);
    });
    it('rejects bad args', () => {
      expect(ChatStopArgs.safeParse(['m1']).success).toBe(false);
      expect(ChatStopArgs.safeParse([1, 'msg1']).success).toBe(false);
    });
  });

  describe('ChatNewConversationArgs', () => {
    it('accepts [mindId]', () => {
      expect(ChatNewConversationArgs.safeParse(['m1']).success).toBe(true);
    });
    it('rejects empty / missing', () => {
      expect(ChatNewConversationArgs.safeParse(['']).success).toBe(false);
      expect(ChatNewConversationArgs.safeParse([]).success).toBe(false);
    });
  });

  describe('ChatListModelsArgs', () => {
    it('accepts [] and [mindId]', () => {
      expect(ChatListModelsArgs.safeParse([]).success).toBe(true);
      expect(ChatListModelsArgs.safeParse(['m1']).success).toBe(true);
    });
    it('rejects non-string mindId', () => {
      expect(ChatListModelsArgs.safeParse([42]).success).toBe(false);
    });
  });

  describe('ModelInfo', () => {
    it('accepts { id, name }', () => {
      expect(ModelInfoSchema.safeParse({ id: 'gpt-5', name: 'GPT-5' }).success).toBe(true);
    });
    it('rejects missing fields', () => {
      expect(ModelInfoSchema.safeParse({ id: 'gpt-5' }).success).toBe(false);
    });
  });

  describe('ContentBlock', () => {
    it('accepts each variant', () => {
      expect(ContentBlockSchema.safeParse({ type: 'text', content: 'hi' }).success).toBe(true);
      expect(
        ContentBlockSchema.safeParse({
          type: 'tool_call',
          toolCallId: 't1',
          toolName: 'shell',
          status: 'running',
        }).success,
      ).toBe(true);
      expect(
        ContentBlockSchema.safeParse({
          type: 'reasoning',
          reasoningId: 'r1',
          content: 'thinking',
        }).success,
      ).toBe(true);
    });

    it('rejects unknown block type', () => {
      expect(ContentBlockSchema.safeParse({ type: 'bogus' }).success).toBe(false);
    });

    it('rejects invalid tool_call status', () => {
      expect(
        ContentBlockSchema.safeParse({
          type: 'tool_call',
          toolCallId: 't1',
          toolName: 'shell',
          status: 'pending',
        }).success,
      ).toBe(false);
    });
  });

  describe('ChatEvent', () => {
    it('accepts each chat event variant', () => {
      const events: unknown[] = [
        { type: 'chunk', content: 'hello' },
        { type: 'chunk', sdkMessageId: 'sdk1', content: 'hello' },
        { type: 'tool_start', toolCallId: 't1', toolName: 'shell' },
        { type: 'tool_start', toolCallId: 't1', toolName: 'shell', args: { cmd: 'ls' } },
        { type: 'tool_progress', toolCallId: 't1', message: 'still going' },
        { type: 'tool_output', toolCallId: 't1', output: 'ok' },
        { type: 'tool_done', toolCallId: 't1', success: true, result: 'ok' },
        { type: 'tool_done', toolCallId: 't1', success: false, error: 'bad' },
        { type: 'reasoning', reasoningId: 'r1', content: 'hmm' },
        { type: 'message_final', sdkMessageId: 'sdk1', content: 'final' },
        { type: 'reconnecting' },
        { type: 'done' },
        { type: 'error', message: 'boom' },
      ];
      for (const evt of events) {
        const result = ChatEventSchema.safeParse(evt);
        if (!result.success) {
          throw new Error(`unexpected failure: ${JSON.stringify(evt)} — ${result.error.message}`);
        }
      }
    });

    it('rejects unknown event type', () => {
      expect(ChatEventSchema.safeParse({ type: 'weird' }).success).toBe(false);
    });

    it('rejects tool_done without success', () => {
      expect(ChatEventSchema.safeParse({ type: 'tool_done', toolCallId: 't1' }).success).toBe(false);
    });
  });
});

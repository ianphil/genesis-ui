import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  IpcValidationError,
  isIpcValidationError,
  fromZodError,
  IPC_VALIDATION_ERROR_CODE,
} from './errors';

describe('IpcValidationError', () => {
  it('carries code, channel, message and is an Error', () => {
    const err = new IpcValidationError('chat:send', 'bad mindId');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(IPC_VALIDATION_ERROR_CODE);
    expect(err.channel).toBe('chat:send');
    expect(err.message).toContain('chat:send');
    expect(err.message).toContain('bad mindId');
  });

  it('IPC_VALIDATION_ERROR_CODE is stable for cross-process comparison', () => {
    expect(IPC_VALIDATION_ERROR_CODE).toBe('INVALID_PARAMS');
  });

  it('isIpcValidationError narrows unknown values', () => {
    const err = new IpcValidationError('mind:add', 'missing path');
    expect(isIpcValidationError(err)).toBe(true);
    expect(isIpcValidationError(new Error('boom'))).toBe(false);
    expect(isIpcValidationError({ code: 'INVALID_PARAMS' })).toBe(false);
    expect(isIpcValidationError(null)).toBe(false);
  });

  it('fromZodError sanitizes ZodError into an IpcValidationError', () => {
    const schema = z.tuple([z.string().min(1)]);
    const parsed = schema.safeParse(['']);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = fromZodError('chat:send', parsed.error);
    expect(err).toBeInstanceOf(IpcValidationError);
    expect(err.channel).toBe('chat:send');
    expect(err.message).toContain('chat:send');
    expect(err.message).not.toContain('ZodError');
  });

  it('exposes issues separately from message for structured consumers', () => {
    const schema = z.tuple([z.string(), z.number()]);
    const parsed = schema.safeParse(['ok', 'nope']);
    if (parsed.success) throw new Error('expected failure');
    const err = fromZodError('mind:setActive', parsed.error);
    expect(Array.isArray(err.issues)).toBe(true);
    expect(err.issues.length).toBeGreaterThan(0);
    expect(err.issues[0]).toHaveProperty('path');
    expect(err.issues[0]).toHaveProperty('message');
  });
});

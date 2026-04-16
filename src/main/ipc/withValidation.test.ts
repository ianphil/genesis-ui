import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { withValidation, withValidationOn } from './withValidation';
import { IpcValidationError } from '../../contracts/errors';

type FakeEvent = { sender: { id: number } };

describe('withValidation (ipcMain.handle)', () => {
  const schema = z.tuple([z.string().min(1), z.number().int().nonnegative()]);

  it('forwards event + typed args to handler when parse succeeds', async () => {
    const handler = vi.fn(async (_event: FakeEvent, name: string, count: number) => {
      return `${name}:${count}`;
    });
    const wrapped = withValidation('demo:ok', schema, handler);
    const event: FakeEvent = { sender: { id: 42 } };

    const result = await wrapped(event, 'alpha', 3);

    expect(result).toBe('alpha:3');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event, 'alpha', 3);
  });

  it('rejects with sanitized IpcValidationError when parse fails; handler never runs', async () => {
    const handler = vi.fn();
    const wrapped = withValidation('demo:bad', schema, handler);
    const event: FakeEvent = { sender: { id: 1 } };

    await expect(wrapped(event, '', -1)).rejects.toBeInstanceOf(IpcValidationError);
    expect(handler).not.toHaveBeenCalled();

    try {
      await wrapped(event, '', -1);
    } catch (e) {
      expect(e).toBeInstanceOf(IpcValidationError);
      const err = e as IpcValidationError;
      expect(err.code).toBe('INVALID_PARAMS');
      expect(err.channel).toBe('demo:bad');
      expect(err.issues.length).toBeGreaterThan(0);
    }
  });

  it('propagates handler errors unchanged (non-validation failures)', async () => {
    const boom = new Error('kapow');
    const wrapped = withValidation('demo:boom', schema, async () => {
      throw boom;
    });
    await expect(wrapped({ sender: { id: 1 } }, 'a', 0)).rejects.toBe(boom);
  });

  it('treats arg count mismatches as validation errors', async () => {
    const handler = vi.fn();
    const wrapped = withValidation('demo:arity', schema, handler);
    const event: FakeEvent = { sender: { id: 0 } };
    // too few args
    await expect((wrapped as (...a: unknown[]) => unknown)(event, 'only-one')).rejects.toBeInstanceOf(
      IpcValidationError,
    );
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withValidationOn (ipcMain.on — no return path)', () => {
  const schema = z.tuple([z.literal('ping')]);

  it('invokes handler when parse succeeds', () => {
    const handler = vi.fn();
    const wrapped = withValidationOn('demo:fire', schema, handler);
    const event: FakeEvent = { sender: { id: 7 } };

    wrapped(event, 'ping');
    expect(handler).toHaveBeenCalledWith(event, 'ping');
  });

  it('logs and drops invalid payloads without throwing (fire-and-forget channel)', () => {
    const handler = vi.fn();
    const onError = vi.fn();
    const wrapped = withValidationOn('demo:fire', schema, handler, { onError });
    const event: FakeEvent = { sender: { id: 7 } };

    expect(() => (wrapped as (...a: unknown[]) => unknown)(event, 'not-ping')).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0] as IpcValidationError;
    expect(err).toBeInstanceOf(IpcValidationError);
    expect(err.channel).toBe('demo:fire');
  });
});

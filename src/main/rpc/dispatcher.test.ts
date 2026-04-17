import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Dispatcher, DispatcherMethodNotFound, type InvocationCtx } from './dispatcher';
import { IpcValidationError } from '../../contracts/errors';

function makeCtx(transport: 'ipc' | 'ws' = 'ipc'): InvocationCtx {
  return {
    reply: { emit: vi.fn() },
    senderHandle: {},
    transport,
  };
}

describe('Dispatcher', () => {
  it('registers and invokes a handler with validated args', async () => {
    const d = new Dispatcher();
    const schema = z.tuple([z.string(), z.number()]);
    const handler = vi.fn(async (args: [string, number]) => args[0].repeat(args[1]));
    d.register('test:echo', schema, handler);

    const result = await d.invoke('test:echo', ['ab', 3], makeCtx());
    expect(result).toBe('ababab');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual(['ab', 3]);
  });

  it('passes the ctx to the handler', async () => {
    const d = new Dispatcher();
    const ctx = makeCtx('ws');
    d.register('test:ctx', z.tuple([]), async (_args, c) => c.transport);
    expect(await d.invoke('test:ctx', [], ctx)).toBe('ws');
  });

  it('throws DispatcherMethodNotFound for unknown channels', async () => {
    const d = new Dispatcher();
    await expect(d.invoke('does:not:exist', [], makeCtx())).rejects.toBeInstanceOf(
      DispatcherMethodNotFound,
    );
  });

  it('throws DispatcherMethodNotFound for ws callers on electron-only channels', async () => {
    const d = new Dispatcher();
    // mind:selectDirectory is classified electron-only.
    d.register('mind:selectDirectory', z.tuple([]), async () => ({ path: '/tmp' }));

    const err = await d
      .invoke('mind:selectDirectory', [], makeCtx('ws'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DispatcherMethodNotFound);
    expect((err as DispatcherMethodNotFound).channel).toBe('mind:selectDirectory');
    expect((err as Error).message).toMatch(/not available on this transport/);
  });

  it('allows electron-only channels over the ipc transport', async () => {
    const d = new Dispatcher();
    d.register('mind:selectDirectory', z.tuple([]), async () => ({ path: '/tmp' }));
    const result = await d.invoke('mind:selectDirectory', [], makeCtx('ipc'));
    expect(result).toEqual({ path: '/tmp' });
  });

  it('throws IpcValidationError with sanitized issues when args fail schema', async () => {
    const d = new Dispatcher();
    d.register('test:strict', z.tuple([z.string()]), async () => 'ok');

    const err = await d.invoke('test:strict', [42], makeCtx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IpcValidationError);
    expect((err as IpcValidationError).channel).toBe('test:strict');
    expect((err as IpcValidationError).issues.length).toBeGreaterThan(0);
  });

  it('does not invoke the handler on validation failure', async () => {
    const d = new Dispatcher();
    const handler = vi.fn();
    d.register('test:strict', z.tuple([z.string()]), handler);

    await d.invoke('test:strict', [42], makeCtx()).catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates handler errors unchanged (mapped to -32603 by transport)', async () => {
    const d = new Dispatcher();
    const boom = new Error('boom');
    d.register('test:boom', z.tuple([]), async () => {
      throw boom;
    });
    const err = await d.invoke('test:boom', [], makeCtx()).catch((e: unknown) => e);
    expect(err).toBe(boom);
  });

  it('rejects duplicate channel registration', () => {
    const d = new Dispatcher();
    d.register('test:dup', z.tuple([]), async () => 1);
    expect(() => d.register('test:dup', z.tuple([]), async () => 2)).toThrow(
      /already registered/,
    );
  });

  it('has() and channels() reflect the registry', () => {
    const d = new Dispatcher();
    d.register('a:x', z.tuple([]), async () => 0);
    d.register('b:y', z.tuple([]), async () => 0);
    expect(d.has('a:x')).toBe(true);
    expect(d.has('nope')).toBe(false);
    expect(new Set(d.channels())).toEqual(new Set(['a:x', 'b:y']));
  });
});

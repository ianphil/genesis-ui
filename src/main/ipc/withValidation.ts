import type { z } from 'zod';
import { fromZodError, IpcValidationError } from '../../contracts/errors';

type AnyTuple = z.ZodTuple;

type HandleArgs<Schema extends AnyTuple> = z.infer<Schema>;

type HandleFn<Event, Schema extends AnyTuple, R> = (
  event: Event,
  ...args: HandleArgs<Schema>
) => R | Promise<R>;

type WrappedHandle<Event, R> = (event: Event, ...args: unknown[]) => Promise<R>;

/**
 * Wraps an `ipcMain.handle` handler with runtime arg validation.
 *
 * On parse failure the returned promise rejects with a sanitized
 * {@link IpcValidationError}. The underlying handler is NOT invoked.
 *
 * Non-validation errors thrown by `handler` propagate unchanged.
 */
export function withValidation<
  Event,
  Schema extends AnyTuple,
  R,
>(
  channel: string,
  schema: Schema,
  handler: HandleFn<Event, Schema, R>,
): WrappedHandle<Event, R> {
  return async (event, ...args) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw fromZodError(channel, parsed.error);
    }
    return handler(event, ...(parsed.data as HandleArgs<Schema>));
  };
}

type OnFn<Event, Schema extends AnyTuple> = (
  event: Event,
  ...args: HandleArgs<Schema>
) => void;

type WrappedOn<Event> = (event: Event, ...args: unknown[]) => void;

export interface WithValidationOnOptions {
  /** Invoked with the sanitized validation error; default = console.error. */
  onError?: (err: IpcValidationError) => void;
}

/**
 * Wraps an `ipcMain.on` listener with runtime arg validation.
 *
 * Unlike `invoke`, `send` has no return channel, so invalid payloads are
 * logged and dropped via `onError` (defaults to console.error) rather than
 * thrown.
 */
export function withValidationOn<Event, Schema extends AnyTuple>(
  channel: string,
  schema: Schema,
  handler: OnFn<Event, Schema>,
  options: WithValidationOnOptions = {},
): WrappedOn<Event> {
  const { onError = (err) => console.error(err) } = options;
  return (event, ...args) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      onError(fromZodError(channel, parsed.error));
      return;
    }
    handler(event, ...(parsed.data as HandleArgs<Schema>));
  };
}

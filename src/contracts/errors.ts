import type { ZodError, ZodIssue } from 'zod';

export const IPC_VALIDATION_ERROR_CODE = 'INVALID_PARAMS';

export interface IpcValidationIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

/**
 * Thrown from IPC handlers when inbound args fail schema validation.
 *
 * Shape is stable and maps onto JSON-RPC 2.0 `-32602` in the Phase 2 WS
 * transport. Do NOT expose raw `ZodError` across the IPC boundary — the
 * renderer must only see this sanitized envelope.
 */
export class IpcValidationError extends Error {
  readonly code: typeof IPC_VALIDATION_ERROR_CODE = IPC_VALIDATION_ERROR_CODE;
  readonly channel: string;
  readonly issues: ReadonlyArray<IpcValidationIssue>;

  constructor(
    channel: string,
    detail: string,
    issues: ReadonlyArray<IpcValidationIssue> = [],
  ) {
    super(`[${channel}] ${detail}`);
    this.name = 'IpcValidationError';
    this.channel = channel;
    this.issues = issues;
  }
}

export function isIpcValidationError(value: unknown): value is IpcValidationError {
  return value instanceof IpcValidationError;
}

function formatIssuePath(issue: ZodIssue): ReadonlyArray<string | number> {
  return issue.path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  );
}

/**
 * Converts a ZodError into a sanitized IpcValidationError.
 * Strips zod-internal metadata; keeps path + human-readable message per issue.
 */
export function fromZodError(channel: string, error: ZodError): IpcValidationError {
  const issues: IpcValidationIssue[] = error.issues.map((issue) => ({
    path: formatIssuePath(issue),
    message: issue.message,
  }));

  const summary =
    issues.length === 0
      ? 'invalid arguments'
      : issues
          .map((issue) => {
            const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
            return `${where}: ${issue.message}`;
          })
          .join('; ');

  return new IpcValidationError(channel, summary, issues);
}

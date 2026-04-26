import { randomBytes, randomUUID } from 'node:crypto';
import type { ChamberCtx } from './types';

export interface ServerCompositionOptions {
  token?: string;
  allowedOrigins?: Iterable<string>;
}

export function createServerContext(options: ServerCompositionOptions = {}): ChamberCtx {
  const token = options.token ?? randomBytes(32).toString('base64url');
  return {
    token,
    allowedOrigins: new Set(options.allowedOrigins ?? [`http://127.0.0.1`]),
    listMinds: () => [],
    getConfig: () => ({ version: 1 }),
    listLensViews: () => [],
    getGenesisStatus: () => ({ ready: false }),
    getAuthStatus: () => ({ authenticated: false }),
    listChamberTools: () => [],
    saveAttachment: async ({ name }) => ({ attachmentId: randomUUID(), name }),
    cancelChat: () => undefined,
    validatePath: () => false,
  };
}

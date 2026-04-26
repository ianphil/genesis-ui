export interface ChamberRequest {
  method: string;
  path: string;
  headers: Headers;
  query?: URLSearchParams;
  body?: unknown;
}

export interface ChamberResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ChamberCtx {
  token: string;
  allowedOrigins: ReadonlySet<string>;
  listMinds: () => unknown[];
  getConfig?: () => unknown;
  listLensViews?: () => unknown;
  getGenesisStatus?: () => unknown;
  getAuthStatus?: () => unknown;
  listChamberTools?: () => unknown;
  publish?: (sessionId: string, event: unknown) => void;
  validatePath?: (candidate: string) => boolean;
  saveAttachment?: (attachment: { name: string; body: ArrayBuffer }) => Promise<unknown>;
  cancelChat?: (sessionId: string) => Promise<void> | void;
  shutdown?: () => void;
  handlePrivilegedRequest?: (request: unknown) => Promise<unknown>;
}

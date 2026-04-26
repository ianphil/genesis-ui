import type { CommandResponse, ListMindsResponse, MindDto } from '@chamber/wire-contracts';

export interface ChamberClientOptions {
  baseUrl: string;
  token: string;
  origin?: string;
}

export class ChamberClient {
  constructor(private readonly options: ChamberClientOptions) {}

  async listMinds(): Promise<MindDto[]> {
    const body = await this.get<ListMindsResponse>('/api/mind/list');
    return body.minds;
  }

  async getConfig(): Promise<unknown> {
    return this.get('/api/config');
  }

  async listLensViews(): Promise<unknown> {
    return this.get('/api/lens/list');
  }

  async getGenesisStatus(): Promise<unknown> {
    return this.get('/api/genesis/status');
  }

  async getAuthStatus(): Promise<unknown> {
    return this.get('/api/auth/status');
  }

  async listChamberTools(): Promise<unknown> {
    return this.get('/api/chamber-tools/list');
  }

  async uploadAttachment(file: Blob, name: string): Promise<unknown> {
    const response = await fetch(new URL(`/api/attachments?name=${encodeURIComponent(name)}`, this.options.baseUrl), {
      headers: {
        authorization: `Bearer ${this.options.token}`,
        ...(this.options.origin ? { origin: this.options.origin } : {}),
      },
      method: 'POST',
      body: file,
    });
    return readJson(response, 'upload attachment');
  }

  async cancelChat(sessionId: string): Promise<CommandResponse> {
    return this.post('/api/chat/cancel', { sessionId });
  }

  private async get<TBody = unknown>(path: string): Promise<TBody> {
    const response = await fetch(new URL(path, this.options.baseUrl), {
      headers: this.headers(),
    });
    return readJson<TBody>(response, `GET ${path}`);
  }

  private async post<TBody = unknown>(path: string, body: unknown): Promise<TBody> {
    const response = await fetch(new URL(path, this.options.baseUrl), {
      headers: { ...this.headers(), 'content-type': 'application/json' },
      method: 'POST',
      body: JSON.stringify(body),
    });
    return readJson<TBody>(response, `POST ${path}`);
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.options.token}`,
      ...(this.options.origin ? { origin: this.options.origin } : {}),
    };
  }
}

async function readJson<TBody>(response: Response, operation: string): Promise<TBody> {
  if (!response.ok) {
    throw new Error(`Failed to ${operation}: ${response.status}`);
  }
  return response.json() as Promise<TBody>;
}

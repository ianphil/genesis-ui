import { Hono } from 'hono';
import type { Context } from 'hono';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import {
  cancelChatHandler,
  getAuthStatusHandler,
  getConfigHandler,
  getGenesisStatusHandler,
  healthHandler,
  listChamberToolsHandler,
  listLensViewsHandler,
  listMindsHandler,
  uploadAttachmentHandler,
} from './handlers';
import { isAllowedOrigin, isAuthorized } from './auth';
import type { ChamberCtx, ChamberRequest, ChamberResponse } from './types';
import { parsePrivilegedRequest } from './privileged-protocol';

function toRequest(c: Context): ChamberRequest {
  const url = new URL(c.req.url);
  return {
    method: c.req.method,
    path: url.pathname,
    query: url.searchParams,
    headers: c.req.raw.headers,
  };
}

async function toRequestWithBody(c: Context): Promise<ChamberRequest> {
  const request = toRequest(c);
  if (c.req.header('content-type')?.includes('application/json')) {
    return { ...request, body: await c.req.json() };
  }
  return { ...request, body: await c.req.arrayBuffer() };
}

function send(c: Context, response: ChamberResponse): Response {
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    c.header(name, value);
  }
  return c.json(response.body ?? null, response.status as 200);
}

function requireAuth(c: Context, ctx: ChamberCtx): Response | null {
  if (!isAllowedOrigin(c.req.header('origin') ?? null, ctx.allowedOrigins)) {
    return c.json({ error: 'Forbidden origin' }, 403);
  }
  if (!isAuthorized(c.req.header('authorization') ?? null, ctx.token)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

export function createHonoApp(ctx: ChamberCtx): Hono {
  const app = new Hono();

  app.get('/api/health', async (c) => send(c, await healthHandler()));
  const authenticated = (handler: (request: ChamberRequest, context: ChamberCtx) => Promise<ChamberResponse>) => async (c: Context) => {
    const authFailure = requireAuth(c, ctx);
    if (authFailure) return authFailure;
    return send(c, await handler(toRequest(c), ctx));
  };

  app.get('/api/mind/list', authenticated(listMindsHandler));
  app.get('/api/config', authenticated(getConfigHandler));
  app.get('/api/lens/list', authenticated(listLensViewsHandler));
  app.get('/api/genesis/status', authenticated(getGenesisStatusHandler));
  app.get('/api/auth/status', authenticated(getAuthStatusHandler));
  app.get('/api/chamber-tools/list', authenticated(listChamberToolsHandler));
  app.post('/api/attachments', async (c) => {
    const authFailure = requireAuth(c, ctx);
    if (authFailure) return authFailure;
    return send(c, await uploadAttachmentHandler(await toRequestWithBody(c), ctx));
  });
  app.post('/api/chat/cancel', async (c) => {
    const authFailure = requireAuth(c, ctx);
    if (authFailure) return authFailure;
    return send(c, await cancelChatHandler(await toRequestWithBody(c), ctx));
  });
  app.post('/api/privileged', async (c) => {
    const authFailure = requireAuth(c, ctx);
    if (authFailure) return authFailure;
    if (!ctx.handlePrivilegedRequest) return c.json({ error: 'Privileged channel unavailable' }, 503);
    const request = parsePrivilegedRequest(await c.req.json());
    return c.json(await ctx.handlePrivilegedRequest(request));
  });
  app.post('/api/shutdown', async (c) => {
    const authFailure = requireAuth(c, ctx);
    if (authFailure) return authFailure;
    setTimeout(() => ctx.shutdown?.(), 0);
    return c.json({ ok: true });
  });
  app.get('*', (c) => c.html('<!doctype html><html><body><h1>Chamber server</h1></body></html>'));

  return app;
}

export function createHttpServer(ctx: ChamberCtx) {
  const app = createHonoApp(ctx);
  const server = createServer((request, response) => {
    const host = request.headers.host ?? '127.0.0.1';
    const url = `http://${host}${request.url ?? '/'}`;
    const webRequest = new Request(url, {
      method: request.method,
      headers: request.headers as HeadersInit,
    });
    void Promise.resolve(app.fetch(webRequest)).then(async (fetchResponse: Response) => {
      response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()));
      response.end(Buffer.from(await fetchResponse.arrayBuffer()));
    });
  });
  const wsServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin ?? null;
    const authorization = request.headers.authorization ?? null;
    if (!isAllowedOrigin(origin, ctx.allowedOrigins) || !isAuthorized(authorization, ctx.token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: 'hello', version: 1 }));
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as { type?: string; sessionId?: string; event?: unknown };
        if (message.type === 'subscribe' && message.sessionId) {
          ctx.publish?.(message.sessionId, { type: 'subscribed' });
          ws.send(JSON.stringify({ version: 1, type: 'subscription:ready', payload: { sessionId: message.sessionId } }));
        }
      });
    });
  });

  return { server, wsServer };
}

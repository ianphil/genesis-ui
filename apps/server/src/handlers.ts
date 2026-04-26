import type { ChamberCtx, ChamberRequest, ChamberResponse } from './types';

export async function healthHandler(): Promise<ChamberResponse> {
  return { status: 200, body: { ok: true } };
}

export async function listMindsHandler(_request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  return { status: 200, body: { minds: ctx.listMinds() } };
}

export async function getConfigHandler(_request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  return { status: 200, body: ctx.getConfig?.() ?? { version: 1 } };
}

export async function listLensViewsHandler(_request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  return { status: 200, body: { views: ctx.listLensViews?.() ?? [] } };
}

export async function getGenesisStatusHandler(_request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  return { status: 200, body: ctx.getGenesisStatus?.() ?? { ready: false } };
}

export async function getAuthStatusHandler(_request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  return { status: 200, body: ctx.getAuthStatus?.() ?? { authenticated: false } };
}

export async function listChamberToolsHandler(_request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  return { status: 200, body: { tools: ctx.listChamberTools?.() ?? [] } };
}

export async function uploadAttachmentHandler(request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  const name = request.query?.get('name')?.trim();
  if (!name) {
    return { status: 400, body: { error: 'Attachment name is required' } };
  }
  if (!request.body || !(request.body instanceof ArrayBuffer)) {
    return { status: 400, body: { error: 'Attachment body is required' } };
  }
  const result = await ctx.saveAttachment?.({ name, body: request.body }) ?? { name };
  return { status: 200, body: result };
}

export async function cancelChatHandler(request: ChamberRequest, ctx: ChamberCtx): Promise<ChamberResponse> {
  const sessionId = typeof request.body === 'object' && request.body !== null && 'sessionId' in request.body
    ? String((request.body as { sessionId: unknown }).sessionId)
    : '';
  if (!sessionId) {
    return { status: 400, body: { error: 'sessionId is required' } };
  }
  await ctx.cancelChat?.(sessionId);
  return { status: 200, body: { ok: true } };
}

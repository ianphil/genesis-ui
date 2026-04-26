import { Hono } from "hono";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
//#region src/handlers.ts
async function healthHandler() {
	return {
		status: 200,
		body: { ok: true }
	};
}
async function listMindsHandler(_request, ctx) {
	return {
		status: 200,
		body: { minds: ctx.listMinds() }
	};
}
async function getConfigHandler(_request, ctx) {
	return {
		status: 200,
		body: ctx.getConfig?.() ?? { version: 1 }
	};
}
async function listLensViewsHandler(_request, ctx) {
	return {
		status: 200,
		body: { views: ctx.listLensViews?.() ?? [] }
	};
}
async function getGenesisStatusHandler(_request, ctx) {
	return {
		status: 200,
		body: ctx.getGenesisStatus?.() ?? { ready: false }
	};
}
async function getAuthStatusHandler(_request, ctx) {
	return {
		status: 200,
		body: ctx.getAuthStatus?.() ?? { authenticated: false }
	};
}
async function listChamberToolsHandler(_request, ctx) {
	return {
		status: 200,
		body: { tools: ctx.listChamberTools?.() ?? [] }
	};
}
async function uploadAttachmentHandler(request, ctx) {
	const name = request.query?.get("name")?.trim();
	if (!name) return {
		status: 400,
		body: { error: "Attachment name is required" }
	};
	if (!request.body || !(request.body instanceof ArrayBuffer)) return {
		status: 400,
		body: { error: "Attachment body is required" }
	};
	return {
		status: 200,
		body: await ctx.saveAttachment?.({
			name,
			body: request.body
		}) ?? { name }
	};
}
async function cancelChatHandler(request, ctx) {
	const sessionId = typeof request.body === "object" && request.body !== null && "sessionId" in request.body ? String(request.body.sessionId) : "";
	if (!sessionId) return {
		status: 400,
		body: { error: "sessionId is required" }
	};
	await ctx.cancelChat?.(sessionId);
	return {
		status: 200,
		body: { ok: true }
	};
}
//#endregion
//#region src/auth.ts
const AUTH_SCHEME = "Bearer ";
function isAllowedOrigin(origin, allowedOrigins) {
	if (origin === null) return true;
	return allowedOrigins.has(origin);
}
function isAuthorized(authorization, token) {
	if (!authorization?.startsWith(AUTH_SCHEME)) return false;
	const candidate = authorization.slice(7);
	const candidateBuffer = Buffer.from(candidate);
	const tokenBuffer = Buffer.from(token);
	return candidateBuffer.length === tokenBuffer.length && timingSafeEqual(candidateBuffer, tokenBuffer);
}
function parsePrivilegedRequest(value) {
	if (!value || typeof value !== "object") throw new Error("Privileged request must be an object.");
	const request = value;
	if (request.protoVersion !== 1) throw new Error(`Unsupported privileged protocol version: ${String(request.protoVersion)}`);
	if (typeof request.requestId !== "string" || request.requestId.length === 0) throw new Error("Privileged request requires requestId.");
	if (typeof request.type !== "string") throw new Error("Privileged request requires type.");
	return request;
}
//#endregion
//#region src/honoAdapter.ts
function toRequest(c) {
	const url = new URL(c.req.url);
	return {
		method: c.req.method,
		path: url.pathname,
		query: url.searchParams,
		headers: c.req.raw.headers
	};
}
async function toRequestWithBody(c) {
	const request = toRequest(c);
	if (c.req.header("content-type")?.includes("application/json")) return {
		...request,
		body: await c.req.json()
	};
	return {
		...request,
		body: await c.req.arrayBuffer()
	};
}
function send(c, response) {
	for (const [name, value] of Object.entries(response.headers ?? {})) c.header(name, value);
	return c.json(response.body ?? null, response.status);
}
function requireAuth(c, ctx) {
	if (!isAllowedOrigin(c.req.header("origin") ?? null, ctx.allowedOrigins)) return c.json({ error: "Forbidden origin" }, 403);
	if (!isAuthorized(c.req.header("authorization") ?? null, ctx.token)) return c.json({ error: "Unauthorized" }, 401);
	return null;
}
function createHonoApp(ctx) {
	const app = new Hono();
	app.get("/api/health", async (c) => send(c, await healthHandler()));
	const authenticated = (handler) => async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		return send(c, await handler(toRequest(c), ctx));
	};
	app.get("/api/mind/list", authenticated(listMindsHandler));
	app.get("/api/config", authenticated(getConfigHandler));
	app.get("/api/lens/list", authenticated(listLensViewsHandler));
	app.get("/api/genesis/status", authenticated(getGenesisStatusHandler));
	app.get("/api/auth/status", authenticated(getAuthStatusHandler));
	app.get("/api/chamber-tools/list", authenticated(listChamberToolsHandler));
	app.post("/api/attachments", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		return send(c, await uploadAttachmentHandler(await toRequestWithBody(c), ctx));
	});
	app.post("/api/chat/cancel", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		return send(c, await cancelChatHandler(await toRequestWithBody(c), ctx));
	});
	app.post("/api/privileged", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		if (!ctx.handlePrivilegedRequest) return c.json({ error: "Privileged channel unavailable" }, 503);
		const request = parsePrivilegedRequest(await c.req.json());
		return c.json(await ctx.handlePrivilegedRequest(request));
	});
	app.post("/api/shutdown", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		setTimeout(() => ctx.shutdown?.(), 0);
		return c.json({ ok: true });
	});
	app.get("*", (c) => c.html("<!doctype html><html><body><h1>Chamber server</h1></body></html>"));
	return app;
}
function createHttpServer(ctx) {
	const app = createHonoApp(ctx);
	const server = createServer((request, response) => {
		const url = `http://${request.headers.host ?? "127.0.0.1"}${request.url ?? "/"}`;
		const webRequest = new Request(url, {
			method: request.method,
			headers: request.headers
		});
		Promise.resolve(app.fetch(webRequest)).then(async (fetchResponse) => {
			response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()));
			response.end(Buffer.from(await fetchResponse.arrayBuffer()));
		});
	});
	const wsServer = new WebSocketServer({ noServer: true });
	server.on("upgrade", (request, socket, head) => {
		const origin = request.headers.origin ?? null;
		const authorization = request.headers.authorization ?? null;
		if (!isAllowedOrigin(origin, ctx.allowedOrigins) || !isAuthorized(authorization, ctx.token)) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}
		wsServer.handleUpgrade(request, socket, head, (ws) => {
			ws.send(JSON.stringify({
				type: "hello",
				version: 1
			}));
			ws.on("message", (data) => {
				const message = JSON.parse(data.toString());
				if (message.type === "subscribe" && message.sessionId) {
					ctx.publish?.(message.sessionId, { type: "subscribed" });
					ws.send(JSON.stringify({
						version: 1,
						type: "subscription:ready",
						payload: { sessionId: message.sessionId }
					}));
				}
			});
		});
	});
	return {
		server,
		wsServer
	};
}
//#endregion
//#region src/composition.ts
function createServerContext(options = {}) {
	return {
		token: options.token ?? randomBytes(32).toString("base64url"),
		allowedOrigins: new Set(options.allowedOrigins ?? [`http://127.0.0.1`]),
		listMinds: () => [],
		getConfig: () => ({ version: 1 }),
		listLensViews: () => [],
		getGenesisStatus: () => ({ ready: false }),
		getAuthStatus: () => ({ authenticated: false }),
		listChamberTools: () => [],
		saveAttachment: async ({ name }) => ({
			attachmentId: randomUUID(),
			name
		}),
		cancelChat: () => void 0,
		validatePath: () => false
	};
}
//#endregion
//#region src/bin.ts
const port = Number(process.env.CHAMBER_SERVER_PORT ?? 0);
const allowedOrigin = process.env.CHAMBER_ALLOWED_ORIGIN ?? "http://127.0.0.1";
const ctx = createServerContext({
	token: process.env.CHAMBER_SERVER_TOKEN,
	allowedOrigins: [allowedOrigin]
});
ctx.shutdown = () => shutdown();
ctx.handlePrivilegedRequest = async (request) => ({
	ok: true,
	request
});
const { server } = createHttpServer({
	...ctx,
	shutdown: () => shutdown()
});
server.listen(port, "127.0.0.1", () => {
	const address = server.address();
	const actualPort = typeof address === "object" && address ? address.port : port;
	console.log(JSON.stringify({
		type: "ready",
		host: "127.0.0.1",
		port: actualPort,
		token: ctx.token
	}));
});
function shutdown() {
	server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
//#endregion
export {};

//# sourceMappingURL=bin.mjs.map
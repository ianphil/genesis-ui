import { Hono } from "hono";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import * as https from "https";
import keytar from "keytar";
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
		body: await ctx.getConfig?.() ?? { version: 1 }
	};
}
async function listLensViewsHandler(_request, ctx) {
	return {
		status: 200,
		body: { views: await ctx.listLensViews?.() ?? [] }
	};
}
async function getGenesisStatusHandler(_request, ctx) {
	return {
		status: 200,
		body: await ctx.getGenesisStatus?.() ?? { ready: false }
	};
}
async function getAuthStatusHandler(_request, ctx) {
	return {
		status: 200,
		body: await ctx.getAuthStatus?.() ?? { authenticated: false }
	};
}
async function listAuthAccountsHandler(_request, ctx) {
	return {
		status: 200,
		body: { accounts: await ctx.listAuthAccounts?.() ?? [] }
	};
}
async function switchAuthAccountHandler(request, ctx) {
	const login = typeof request.body === "object" && request.body !== null && "login" in request.body ? String(request.body.login) : "";
	if (!login) return {
		status: 400,
		body: { error: "login is required" }
	};
	if (!ctx.switchAuthAccount) return {
		status: 503,
		body: { error: "Auth account switching is unavailable" }
	};
	await ctx.switchAuthAccount(login);
	return {
		status: 200,
		body: { ok: true }
	};
}
async function logoutAuthHandler(_request, ctx) {
	if (!ctx.logoutAuth) return {
		status: 503,
		body: { error: "Auth logout is unavailable" }
	};
	await ctx.logoutAuth();
	return {
		status: 200,
		body: { ok: true }
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
function streamAuthLogin(c, ctx) {
	const startAuthLogin = ctx.startAuthLogin;
	if (!startAuthLogin) return c.json({ error: "Auth login is unavailable" }, 503);
	const encoder = new TextEncoder();
	const body = new ReadableStream({ start(controller) {
		const write = (event) => {
			controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
		};
		startAuthLogin((progress) => write({
			type: "progress",
			progress
		})).then((result) => write({
			type: "result",
			result
		})).catch((error) => {
			write({
				type: "result",
				result: {
					success: false,
					error: error instanceof Error ? error.message : String(error)
				}
			});
		}).finally(() => controller.close());
	} });
	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "application/x-ndjson; charset=utf-8",
			"cache-control": "no-store"
		}
	});
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
	app.get("/api/auth/accounts", authenticated(listAuthAccountsHandler));
	app.post("/api/auth/login", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		return streamAuthLogin(c, ctx);
	});
	app.post("/api/auth/switch", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		return send(c, await switchAuthAccountHandler(await toRequestWithBody(c), ctx));
	});
	app.post("/api/auth/logout", async (c) => {
		const authFailure = requireAuth(c, ctx);
		if (authFailure) return authFailure;
		return send(c, await logoutAuthHandler(toRequest(c), ctx));
	});
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
		listAuthAccounts: () => [],
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
//#region ../../packages/services/src/auth/AuthService.ts
const CLIENT_ID = "Ov23ctDVkRmgkPke0Mmm";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const AUTH_SCOPE = "read:user,read:org,repo,gist";
const KEYTAR_SERVICE = "copilot-cli";
const GITHUB_ACCOUNT_PREFIX = "https://github.com:";
function getCredentialAccount(login) {
	return `${GITHUB_ACCOUNT_PREFIX}${login}`;
}
function getLoginFromAccount(account) {
	if (!account.startsWith(GITHUB_ACCOUNT_PREFIX)) return null;
	return account.slice(19).trim() || null;
}
function postJson(url, body) {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify(body);
		const parsed = new URL(url);
		const options = {
			hostname: parsed.hostname,
			path: parsed.pathname,
			method: "POST",
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(data),
				"User-Agent": AuthService.userAgent
			}
		};
		const req = https.request(options, (res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				try {
					resolve(JSON.parse(body));
				} catch {
					reject(/* @__PURE__ */ new Error(`Invalid JSON: ${body}`));
				}
			});
		});
		req.on("error", reject);
		req.write(data);
		req.end();
	});
}
function getJson(url, token) {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const options = {
			hostname: parsed.hostname,
			path: parsed.pathname,
			method: "GET",
			headers: {
				"Accept": "application/json",
				"Authorization": `Bearer ${token}`,
				"User-Agent": AuthService.userAgent
			}
		};
		const req = https.request(options, (res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				try {
					resolve(JSON.parse(body));
				} catch {
					reject(/* @__PURE__ */ new Error(`Invalid JSON: ${body}`));
				}
			});
		});
		req.on("error", reject);
		req.end();
	});
}
var AuthService = class AuthService {
	static userAgent = "Chamber/dev";
	onProgress;
	aborted = false;
	constructor(credentials, getActiveLogin = () => null, setActiveLogin = () => void 0, userAgent) {
		this.credentials = credentials;
		this.getActiveLogin = getActiveLogin;
		this.setActiveLogin = setActiveLogin;
		if (userAgent) AuthService.userAgent = userAgent;
	}
	setProgressHandler(handler) {
		this.onProgress = handler;
	}
	abort() {
		this.aborted = true;
	}
	async listAccounts() {
		try {
			return (await this.getStoredCredentials()).map(({ login }) => ({ login }));
		} catch (err) {
			console.error("[Auth] Failed to list stored credentials:", err);
			return [];
		}
	}
	async getStoredCredential() {
		try {
			const credential = await this.getStoredCredentialEntry();
			return credential ? { login: credential.login } : null;
		} catch (err) {
			console.error("[Auth] Failed to read stored credential:", err);
		}
		return null;
	}
	async logout() {
		this.abort();
		try {
			const credential = await this.getStoredCredentialEntry();
			if (!credential) return;
			await this.credentials.deletePassword(KEYTAR_SERVICE, credential.account);
			this.setActiveLogin(null);
			console.log(`[Auth] Deleted credential for ${credential.login}`);
		} catch (err) {
			console.error("[Auth] Failed to delete credential:", err);
		}
	}
	async getStoredCredentials() {
		return (await this.credentials.findCredentials(KEYTAR_SERVICE)).map((credential) => {
			const login = getLoginFromAccount(credential.account);
			if (!login || !credential.password) return null;
			return {
				login,
				account: credential.account,
				password: credential.password
			};
		}).filter((credential) => credential !== null).sort((a, b) => a.login.localeCompare(b.login));
	}
	async getStoredCredentialEntry() {
		const credentials = await this.getStoredCredentials();
		if (credentials.length === 0) return null;
		const activeLogin = this.getActiveLogin();
		if (activeLogin === null) {
			if (credentials.length > 1) console.warn(`[Auth] Multiple Copilot credentials found; using ${credentials[0].account}`);
			return credentials[0];
		}
		return credentials.find((credential) => credential.login === activeLogin) ?? null;
	}
	async storeCredential(login, token) {
		await this.credentials.setPassword(KEYTAR_SERVICE, getCredentialAccount(login), token);
		console.log(`[Auth] Stored credential for ${login} via keytar`);
	}
	async startLogin() {
		this.aborted = false;
		try {
			const deviceResp = await postJson(DEVICE_CODE_URL, {
				client_id: CLIENT_ID,
				scope: AUTH_SCOPE
			});
			const userCode = String(deviceResp.user_code);
			const verificationUri = String(deviceResp.verification_uri_complete ?? deviceResp.verification_uri);
			const deviceCode = String(deviceResp.device_code);
			let interval = Number(deviceResp.interval) || 5;
			const expiresIn = Number(deviceResp.expires_in) || 900;
			this.onProgress?.({
				step: "device_code",
				userCode,
				verificationUri
			});
			this.onProgress?.({
				step: "polling",
				userCode,
				verificationUri
			});
			const deadline = Date.now() + expiresIn * 1e3;
			while (Date.now() < deadline && !this.aborted) {
				await new Promise((r) => setTimeout(r, interval * 1e3));
				if (this.aborted) return { success: false };
				const tokenResp = await postJson(ACCESS_TOKEN_URL, {
					client_id: CLIENT_ID,
					device_code: deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code"
				});
				if (tokenResp.access_token) {
					const token = String(tokenResp.access_token);
					let login = "user";
					try {
						const user = await getJson("https://api.github.com/user", token);
						login = String(user.login);
					} catch (err) {
						console.warn("[Auth] Failed to fetch user login, using default account name:", err);
					}
					await this.storeCredential(login, token);
					this.onProgress?.({
						step: "authenticated",
						login
					});
					return {
						success: true,
						login
					};
				}
				const error = String(tokenResp.error || "");
				if (error === "authorization_pending") continue;
				if (error === "slow_down") {
					interval += 5;
					continue;
				}
				this.onProgress?.({
					step: "error",
					error: `Auth failed: ${error}`
				});
				return { success: false };
			}
			if (this.aborted) return { success: false };
			this.onProgress?.({
				step: "error",
				error: "Timed out waiting for authorization"
			});
			return { success: false };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.onProgress?.({
				step: "error",
				error: message
			});
			return { success: false };
		}
	}
};
//#endregion
//#region src/bin.ts
const port = Number(process.env.CHAMBER_SERVER_PORT ?? 0);
const allowedOrigin = process.env.CHAMBER_ALLOWED_ORIGIN ?? "http://127.0.0.1";
const ctx = createServerContext({
	token: process.env.CHAMBER_SERVER_TOKEN,
	allowedOrigins: [allowedOrigin]
});
let activeLogin = null;
const authService = new AuthService(keytar, () => activeLogin, (login) => {
	activeLogin = login;
});
ctx.getAuthStatus = async () => {
	const credential = await authService.getStoredCredential();
	return {
		authenticated: credential !== null,
		login: credential?.login
	};
};
ctx.listAuthAccounts = () => authService.listAccounts();
ctx.startAuthLogin = async (onProgress) => {
	authService.setProgressHandler(onProgress);
	const result = await authService.startLogin();
	if (result.success && result.login) authService.setActiveLogin(result.login);
	return result;
};
ctx.switchAuthAccount = async (login) => {
	if (!(await authService.listAccounts()).some((account) => account.login === login)) throw new Error(`Account ${login} is not available`);
	authService.setActiveLogin(login);
};
ctx.logoutAuth = () => authService.logout();
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
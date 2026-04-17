import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  JSON_RPC_ERROR,
  encodeError,
  encodeNotification,
  encodeResult,
  parseInbound,
  type JsonRpcId,
} from './jsonRpc';
import {
  Dispatcher,
  DispatcherMethodNotFound,
  IpcValidationError,
  type InvocationCtx,
} from './dispatcher';
import type { PushBus } from './pushBus';

export interface RpcSidecarOptions {
  dispatcher: Dispatcher;
  pushBus: PushBus;
  /** Directory to write the port file into (typically `app.getPath('userData')`). */
  portFileDir: string;
  /** Host to bind. Defaults to 127.0.0.1 — never bind anywhere else. */
  host?: string;
  /** Port to bind. Defaults to 0 (OS-assigned). */
  port?: number;
  /** Error logger, defaults to console.error. */
  logError?: (msg: string, err?: unknown) => void;
}

export interface RpcSidecarHandle {
  readonly port: number;
  readonly portFilePath: string;
  close(): Promise<void>;
}

const PORT_FILE_NAME = 'rpc-port.json';

/**
 * Starts the loopback WebSocket sidecar speaking JSON-RPC 2.0. Binds to
 * 127.0.0.1 and writes `<portFileDir>/rpc-port.json` atomically after the
 * server has begun listening so that tests and external clients can
 * discover the port without racing on startup.
 *
 * **No auth.** Anyone with access to the loopback interface can connect.
 * Pairing-URL auth is deferred to Phase 5.
 */
export async function startRpcSidecar(
  opts: RpcSidecarOptions,
): Promise<RpcSidecarHandle> {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 0;
  const logError = opts.logError ?? ((msg, err) => console.error(`[rpc] ${msg}`, err));

  const httpServer: HttpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  // Per-connection reply emitter — notifications sent only to this socket.
  function makeReply(socket: WebSocket): InvocationCtx['reply'] {
    return {
      emit(channel, payload) {
        if (socket.readyState !== 1 /* OPEN */) return;
        try {
          socket.send(encodeNotification(channel, payload));
        } catch (err) {
          logError(`reply.emit failed on ${channel}`, err);
        }
      },
    };
  }

  // Fan-out pushBus broadcasts to every live socket.
  const unsubscribePush = opts.pushBus.subscribe((channel, payload) => {
    const frame = encodeNotification(channel, payload);
    for (const socket of wss.clients) {
      if (socket.readyState !== 1 /* OPEN */) continue;
      try {
        socket.send(frame);
      } catch (err) {
        logError(`pushBus broadcast failed on ${channel}`, err);
      }
    }
  });

  wss.on('connection', (socket) => {
    socket.on('message', async (data) => {
      const raw = data.toString('utf8');
      const parsed = parseInbound(raw);

      if (parsed.kind === 'parse-error') {
        socket.send(
          encodeError(null, JSON_RPC_ERROR.PARSE_ERROR, `Parse error: ${parsed.detail}`),
        );
        return;
      }
      if (parsed.kind === 'invalid-request') {
        socket.send(
          encodeError(
            parsed.id,
            JSON_RPC_ERROR.INVALID_REQUEST,
            `Invalid Request: ${parsed.detail}`,
          ),
        );
        return;
      }

      // Notifications: dispatch fire-and-forget, no response.
      if (parsed.kind === 'notification') {
        const { method, params } = parsed.value;
        const args = paramsToArgs(params);
        if (!args) return; // silently drop; notifications have no reply channel
        const ctx: InvocationCtx = {
          reply: makeReply(socket),
          senderHandle: socket,
          transport: 'ws',
        };
        try {
          await opts.dispatcher.invoke(method, args, ctx);
        } catch (err) {
          logError(`notification handler failed: ${method}`, err);
        }
        return;
      }

      // Request: dispatch and respond.
      const { id, method, params } = parsed.value;
      const args = paramsToArgs(params);
      if (!args) {
        socket.send(
          encodeError(
            id,
            JSON_RPC_ERROR.INVALID_PARAMS,
            'params must be an array (named params not supported in Phase 2)',
          ),
        );
        return;
      }

      const ctx: InvocationCtx = {
        reply: makeReply(socket),
        senderHandle: socket,
        transport: 'ws',
      };

      try {
        const result = await opts.dispatcher.invoke(method, args, ctx);
        socket.send(encodeResult(id, result ?? null));
      } catch (err) {
        socket.send(errorFrameFor(id, err));
      }
    });
  });

  // Bind.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      httpServer.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, host);
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('[rpc] failed to resolve bound port');
  }
  const boundPort = address.port;

  // Atomic port-file write. Tests should poll connectability, not file
  // existence — the file is a discovery hint, not a liveness signal.
  const portFilePath = path.join(opts.portFileDir, PORT_FILE_NAME);
  const payload = JSON.stringify({ pid: process.pid, port: boundPort, host }, null, 2);
  try {
    fs.mkdirSync(opts.portFileDir, { recursive: true });
    const tmp = portFilePath + '.tmp';
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, portFilePath);
  } catch (err) {
    logError('failed to write port file', err);
    // Not fatal — the sidecar is still reachable on the returned port.
  }

  return {
    port: boundPort,
    portFilePath,
    async close() {
      unsubscribePush();
      for (const socket of wss.clients) {
        try {
          socket.close();
        } catch {
          // swallow
        }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      try {
        fs.unlinkSync(portFilePath);
      } catch {
        // File may already be gone.
      }
    },
  };
}

/**
 * JSON-RPC `params` may be an array (positional) or an object (named).
 * Dispatcher handlers are tuple-typed, so Phase 2 accepts array-form only.
 * Missing params = empty args array (valid for nullary tuples).
 */
function paramsToArgs(params: unknown): unknown[] | null {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params;
  return null;
}

function errorFrameFor(id: JsonRpcId, err: unknown): string {
  if (err instanceof DispatcherMethodNotFound) {
    return encodeError(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, err.message, {
      channel: err.channel,
    });
  }
  if (err instanceof IpcValidationError) {
    return encodeError(id, JSON_RPC_ERROR.INVALID_PARAMS, err.message, {
      channel: err.channel,
      issues: err.issues,
    });
  }
  // Sanitize: surface only the message string. No stack, no cause chain.
  const message = err instanceof Error ? err.message : String(err);
  return encodeError(id, JSON_RPC_ERROR.INTERNAL_ERROR, message);
}

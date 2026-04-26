import { createHttpServer } from './honoAdapter';
import { createServerContext } from './composition';

const port = Number(process.env.CHAMBER_SERVER_PORT ?? 0);
const allowedOrigin = process.env.CHAMBER_ALLOWED_ORIGIN ?? 'http://127.0.0.1';

const ctx = createServerContext({
  token: process.env.CHAMBER_SERVER_TOKEN,
  allowedOrigins: [allowedOrigin],
});
ctx.shutdown = () => shutdown();
ctx.handlePrivilegedRequest = async (request) => ({ ok: true, request });

const { server } = createHttpServer({
  ...ctx,
  shutdown: () => shutdown(),
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(JSON.stringify({ type: 'ready', host: '127.0.0.1', port: actualPort, token: ctx.token }));
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

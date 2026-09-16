import { createServer } from 'node:http';
import nextEnv from '@next/env';

// .env / .env.local must be loaded before anything reads process.env, and
// static imports are evaluated before this file's body runs, so the rest of
// the server is imported dynamically below.
const dev = process.env.NODE_ENV !== 'production';
nextEnv.loadEnvConfig(process.cwd(), dev);

const { default: next } = await import('next');
const { createSocketServer } = await import('./src/server/socket/index.js');

// Same shape as Quiz Mania's server.js: Next and Socket.IO share one port so
// there is a single origin to configure and no separate WebSocket deployment.
const port = Number.parseInt(process.env.PORT ?? '4100', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
createSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`> Backtracking Arena ready on http://localhost:${port}`);
});

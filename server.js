import { createServer } from 'node:http';
import next from 'next';
import { createSocketServer } from './src/server/socket/index.js';

// Same shape as Quiz Mania's server.js: Next and Socket.IO share one port so
// there is a single origin to configure and no separate WebSocket deployment.
const port = Number.parseInt(process.env.PORT ?? '4100', 10);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
createSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`> Backtracking Arena ready on http://localhost:${port}`);
});

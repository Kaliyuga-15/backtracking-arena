import { Server } from 'socket.io';
import { ARENA_NAMESPACE } from '../../lib/constants.js';
import { identityFromHeaders } from '../../lib/auth.js';
import { setArenaNamespace } from '../../lib/realtime.js';
import { registerArenaHandlers } from './arenaHandlers.js';

// Mounted as its own namespace so this can share one Socket.IO server with Quiz
// Mania's quiz events after the merge.
export const attachArenaSocket = (io) => {
  const namespace = io.of(ARENA_NAMESPACE);

  namespace.use((socket, next) => {
    // The handshake carries the same bearer token the HTTP API expects, so a
    // socket can never claim an identity the API would have rejected. This is
    // the gap Quiz Mania's README flags in its own socket layer.
    const identity = identityFromHeaders({
      get: (key) => socket.handshake.auth?.[key] ?? socket.handshake.headers?.[key] ?? null,
    });

    if (!identity) return next(new Error('unauthorized'));

    socket.data.identity = identity;
    return next();
  });

  registerArenaHandlers(namespace);
  setArenaNamespace(namespace);

  return namespace;
};

export const createSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN || '*' },
  });

  attachArenaSocket(io);
  return io;
};

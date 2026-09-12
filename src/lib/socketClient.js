'use client';

import { io } from 'socket.io-client';
import { ARENA_NAMESPACE } from './constants';
import { socketAuth } from './identity';

// One shared connection per tab, cached on window so React strict-mode's double
// effect run does not open two sockets.
export const getArenaSocket = () => {
  if (typeof window === 'undefined') return null;

  if (!window.__arenaSocket) {
    const base = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    window.__arenaSocket = io(`${base}${ARENA_NAMESPACE}`, {
      auth: socketAuth(),
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }

  return window.__arenaSocket;
};

export const resetArenaSocket = () => {
  if (typeof window === 'undefined') return;
  window.__arenaSocket?.disconnect();
  window.__arenaSocket = null;
};

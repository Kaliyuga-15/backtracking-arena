'use client';

import { useEffect, useState } from 'react';
import { getArenaSocket } from '@/lib/socketClient';
import { ARENA_SOCKET_EVENTS } from '@/lib/constants';

// Subscribes to one contest and mirrors whatever the server says about it.
// The countdown is derived from the server's endsAt rather than a local timer,
// so a contestant cannot buy time by pausing their tab or changing the clock.
export const useArena = (contestKey) => {
  const [contest, setContest] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!contestKey) return undefined;

    const socket = getArenaSocket();
    if (!socket) return undefined;

    const join = () => {
      setConnected(true);
      setError(null);
      socket.emit(ARENA_SOCKET_EVENTS.JOIN, { contestKey });
    };

    if (socket.connected) join();

    socket.on('connect', join);
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) =>
      setError(err.message === 'unauthorized' ? 'Sign in to see live standings.' : err.message)
    );
    socket.on(ARENA_SOCKET_EVENTS.CONTEST_STATE, setContest);
    socket.on(ARENA_SOCKET_EVENTS.LEADERBOARD_UPDATE, setLeaderboard);
    socket.on(ARENA_SOCKET_EVENTS.ERROR, (payload) => setError(payload?.message ?? 'Arena error'));

    return () => {
      socket.off('connect', join);
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off(ARENA_SOCKET_EVENTS.CONTEST_STATE, setContest);
      socket.off(ARENA_SOCKET_EVENTS.LEADERBOARD_UPDATE, setLeaderboard);
      socket.off(ARENA_SOCKET_EVENTS.ERROR);
    };
  }, [contestKey]);

  return { contest, leaderboard, connected, error, setContest };
};

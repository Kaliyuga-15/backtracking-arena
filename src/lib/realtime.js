import { ARENA_SOCKET_EVENTS } from './constants.js';
import { leaderboardFor } from './leaderboardService.js';

// server.js parks the Socket.IO namespace here so route handlers can broadcast
// without importing the server. When the module is loaded outside the custom
// server (a seed script, say) this is simply null and broadcasts no-op.
export const setArenaNamespace = (namespace) => {
  globalThis.__arenaNamespace = namespace;
};

export const arenaNamespace = () => globalThis.__arenaNamespace ?? null;

export const contestRoom = (contestKey) => `contest:${contestKey}`;

const throttle = globalThis.__arenaBroadcastThrottle ?? { timers: new Map(), pending: new Map() };
globalThis.__arenaBroadcastThrottle = throttle;

const BROADCAST_INTERVAL_MS = 1500;

// During the closing minutes of a contest every accepted submission would
// otherwise trigger a full leaderboard recompute and fan-out. Collapsing them
// into at most one broadcast per interval keeps the standings live without
// melting the database.
export const broadcastLeaderboard = (contestKey) => {
  if (!arenaNamespace()) return;

  if (throttle.timers.has(contestKey)) {
    throttle.pending.set(contestKey, true);
    return;
  }

  const emit = async () => {
    try {
      const rows = await leaderboardFor(contestKey);
      arenaNamespace()?.to(contestRoom(contestKey)).emit(ARENA_SOCKET_EVENTS.LEADERBOARD_UPDATE, rows);
    } catch (err) {
      console.error('[arena realtime] leaderboard broadcast failed', err);
    }
  };

  emit();

  throttle.timers.set(
    contestKey,
    setTimeout(() => {
      throttle.timers.delete(contestKey);
      if (throttle.pending.delete(contestKey)) broadcastLeaderboard(contestKey);
    }, BROADCAST_INTERVAL_MS)
  );
};

export const broadcastContestState = (contest) => {
  arenaNamespace()
    ?.to(contestRoom(contest.key))
    .emit(ARENA_SOCKET_EVENTS.CONTEST_STATE, contest.toStatePayload());
};

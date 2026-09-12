import { connectDB } from '../../lib/db.js';
import { Contest } from '../../models/Contest.js';
import { ARENA_SOCKET_EVENTS } from '../../lib/constants.js';
import { contestRoom } from '../../lib/realtime.js';
import { leaderboardFor } from '../../lib/leaderboardService.js';

// Sockets are read-only here: they push contest state and standings out. Every
// mutation still goes through the HTTP API, so there is exactly one path where
// code gets judged and scored.
export const registerArenaHandlers = (namespace) => {
  namespace.on('connection', (socket) => {
    const { identity } = socket.data;

    socket.on(ARENA_SOCKET_EVENTS.JOIN, async ({ contestKey } = {}) => {
      if (!contestKey) {
        socket.emit(ARENA_SOCKET_EVENTS.ERROR, { message: 'contestKey is required' });
        return;
      }

      try {
        await connectDB();
        const contest = await Contest.findOne({ key: contestKey });
        if (!contest) {
          socket.emit(ARENA_SOCKET_EVENTS.ERROR, { message: 'Contest not found' });
          return;
        }

        socket.join(contestRoom(contestKey));
        socket.data.contestKey = contestKey;

        socket.emit(ARENA_SOCKET_EVENTS.CONTEST_STATE, contest.toStatePayload());
        socket.emit(ARENA_SOCKET_EVENTS.LEADERBOARD_UPDATE, await leaderboardFor(contestKey));
      } catch (err) {
        console.error('[arena socket] join failed', err);
        socket.emit(ARENA_SOCKET_EVENTS.ERROR, { message: 'Could not join the contest.' });
      }
    });

    socket.on(ARENA_SOCKET_EVENTS.LEAVE, () => {
      if (socket.data.contestKey) {
        socket.leave(contestRoom(socket.data.contestKey));
        socket.data.contestKey = null;
      }
    });

    socket.on('disconnect', () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[arena socket] ${identity.userId} disconnected`);
      }
    });
  });
};

# Folding this into Quiz Mania

This folder mirrors Quiz Mania's structure and conventions — `{ success, data }`
envelopes, the `@/*` alias, the cached-Mongoose pattern, the Tailwind idiom — so
integration is mostly copying directories. **There are no new npm
dependencies**: both projects use the same six packages.

## 1. Copy the files that have no counterpart

```
src/lib/judge/                      src/lib/engine/
src/lib/auth.js                     src/lib/scoring.js
src/lib/rateLimit.js                src/lib/realtime.js
src/lib/leaderboardService.js       src/lib/identity.js
src/lib/apiClient.js                src/lib/api.js
src/lib/playground.js
src/models/Problem.js               src/models/Submission.js
src/models/Contest.js               src/models/TerminalOutput.js
src/app/api/arena/                  src/app/arena/[slug]/
src/app/admin/                      src/hooks/useArena.js
src/server/socket/arenaHandlers.js
scripts/                            (everything except Quiz Mania's own seedQuiz.js)
certs/                              (the engine CA certificate, not committed)
```

Components — none collide with Quiz Mania's: `ArenaHome.js`,
`ProblemWorkspace.js`, `Terminal.js`, `AdminConsole.js`, `CodeEditor.js`,
`VerdictPanel.js`, `ArenaLeaderboard.js`, `ContestTimer.js`, `IdentityBadge.js`.

This project's `src/app/page.js` (the arena home) becomes
`src/app/arena/page.js`, because Quiz Mania owns `/`. In `ProblemWorkspace.js`,
change the "All problems" link from `/` to `/arena`.

## 2. Merge the four files that collide

### `src/lib/db.js` — keep Quiz Mania's

Everything here imports `connectDB` by name, so nothing else changes.

### `src/lib/constants.js` — append

Paste this project's `LEVELS`, `PROBLEM_STATUS`, `CONTEST_STATUS`, `VERDICT`,
`TEST_STATUS`, `VERDICT_LABEL`, `ARENA_SOCKET_EVENTS` and `ARENA_NAMESPACE`
exports into Quiz Mania's file. No names overlap.

### `src/lib/socketClient.js` — keep both sets of exports

Both projects have this file with different exports: Quiz Mania's
`getSocket` / `disconnectSocket` (default namespace, `playerId` auth) and this
project's `getArenaSocket` / `resetArenaSocket` (`/arena` namespace, JWT auth).
Put all four in one file. Connect the arena socket with the same
`path: '/socket.io'` Quiz Mania's server sets.

### `src/server/socket/index.js` — add the `/arena` namespace

Quiz Mania's file exports `initSocketServer(httpServer)` and registers quiz
handlers on each connection. Add, before it returns `io`:

```js
import { registerArenaHandlers } from './arenaHandlers.js';
import { ARENA_NAMESPACE } from '../../lib/constants.js';
import { identityFromHeaders } from '../../lib/auth.js';
import { setArenaNamespace } from '../../lib/realtime.js';

const arena = io.of(ARENA_NAMESPACE);
arena.use((socket, next) => {
  const identity = identityFromHeaders({
    get: (key) => socket.handshake.auth?.[key] ?? socket.handshake.headers?.[key] ?? null,
  });
  if (!identity) return next(new Error('unauthorized'));
  socket.data.identity = identity;
  return next();
});
registerArenaHandlers(arena);
setArenaNamespace(arena);
```

Quiz events stay on the default namespace, arena events on `/arena`.

Quiz Mania's `server.js` already loads `.env*` before importing the rest, which
this project's server also does — keep that ordering.

## 3. Env and scripts

Append this project's `.env.example` section (auth, admin ids, `JUDGE_BACKEND`,
`QUERY_SERVER_URL`, `QUERY_SERVER_API_KEY`, `QUERY_SERVER_CA_CERT`,
`ENGINE_CONCURRENCY`, cooldown) to Quiz Mania's. The API key goes in
`.env.local` only.

Add to `package.json` scripts: `seed:problems`, `verify:cards`, `check:engine`,
`test:engine`, `test:judge` (same commands as here).

Both projects can share one database: `problems`, `terminaloutputs`,
`submissions` and `contests` don't collide with `quizzes`, `rooms` or
`attempts`.

After copying: `npm run seed:problems && npm run verify:cards`, then
`npm run check:engine` from the campus network.

## 4. Link it up

```jsx
<Link href="/arena">Level 2 — Backtracking</Link>
```

## Where the two projects disagree

Quiz Mania's socket middleware trusts whatever `playerId` a client sends. This
project verifies an HS256 JWT on both the HTTP API and the socket handshake
(`src/lib/auth.js`). After merging, point Quiz Mania's socket auth at the same
`auth.js` so both halves share one trust model.

## Deployment note

The engine request limiter, the local judge queue and the submit rate limiter
all hold state in the process. Run one instance.

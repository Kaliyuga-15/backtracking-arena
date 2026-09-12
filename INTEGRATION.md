# Folding this into Quiz Mania

This folder deliberately mirrors Quiz Mania's structure and conventions —
same `{ success, data }` envelopes, same `@/*` alias, same cached-Mongoose
pattern, same Tailwind idiom — so integration is mostly copying directories.

**There are no new npm dependencies.** Both projects use the same six packages.

## 1. Copy the files that have no counterpart

These land in Quiz Mania untouched:

```
src/lib/judge/                 -> src/lib/judge/
src/lib/auth.js                -> src/lib/auth.js
src/lib/scoring.js             -> src/lib/scoring.js
src/lib/rateLimit.js           -> src/lib/rateLimit.js
src/lib/realtime.js            -> src/lib/realtime.js
src/lib/leaderboardService.js  -> src/lib/leaderboardService.js
src/lib/identity.js            -> src/lib/identity.js
src/lib/apiClient.js           -> src/lib/apiClient.js
src/lib/api.js                 -> src/lib/api.js
src/models/Problem.js          -> src/models/Problem.js
src/models/Submission.js       -> src/models/Submission.js
src/models/Contest.js          -> src/models/Contest.js
src/app/api/arena/             -> src/app/api/arena/
src/app/arena/                 -> src/app/arena/
src/app/admin/                 -> src/app/admin/
src/hooks/useArena.js          -> src/hooks/useArena.js
scripts/problemCards.js        -> scripts/problemCards.js
scripts/seedProblems.js        -> scripts/seedProblems.js
scripts/testJudge.js           -> scripts/testJudge.js
scripts/testApi.js             -> scripts/testApi.js
scripts/loadTest.js            -> scripts/loadTest.js
```

Components: copy `ArenaHome.js`, `ProblemWorkspace.js`, `AdminConsole.js`,
`CodeEditor.js`, `SamplePattern.js`, `VerdictPanel.js`, `ArenaLeaderboard.js`,
`ContestTimer.js`, `IdentityBadge.js` into `src/components/`. None of these
names collide with Quiz Mania's existing components.

## 2. Merge the three files that do collide

### `src/lib/db.js` — keep Quiz Mania's

Delete this folder's copy. They are the same implementation with a different
`globalThis` cache key. Everything here imports `connectDB` by name, so nothing
changes.

### `src/lib/constants.js` — append

Paste this project's `LEVELS`, `PROBLEM_STATUS`, `CONTEST_STATUS`, `VERDICT`,
`TEST_STATUS`, `VERDICT_LABEL`, `ARENA_SOCKET_EVENTS` and `ARENA_NAMESPACE`
exports into Quiz Mania's `constants.js`. Nothing overlaps — Quiz Mania has
`QUIZ_STATUS`, `ROOM_STATUS` and `SOCKET_EVENTS`, and the arena events are
namespaced `arena:*` precisely so they can coexist.

### `src/server/socket/index.js` — add one call

Quiz Mania builds its Socket.IO server and registers quiz handlers. Add the
arena namespace beside it:

```js
import { attachArenaSocket } from './arenaSocket.js';   // this project's src/server/socket/index.js

export const createSocketServer = (httpServer) => {
  const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || '*' } });

  registerQuizHandlers(io);   // existing
  attachArenaSocket(io);      // new: mounts the /arena namespace

  return io;
};
```

Copy this project's `src/server/socket/index.js` in as
`src/server/socket/arenaSocket.js` (exporting `attachArenaSocket`) and its
`arenaHandlers.js` alongside. Quiz events stay on the default namespace, arena
events on `/arena`; one server, one port, no interference.

## 3. Env and scripts

Append to Quiz Mania's `.env.example`:

```
AUTH_JWT_SECRET=
AUTH_JWT_ISSUER=
ALLOW_DEV_AUTH=false
ADMIN_USER_IDS=
JUDGE_CONCURRENCY=3
JUDGE_SUBMIT_COOLDOWN_MS=5000
JUDGE_WORKDIR=/tmp/arena-judge
```

Add to `package.json` scripts:

```json
"seed:problems": "node scripts/seedProblems.js",
"test:judge": "node scripts/testJudge.js"
```

Both projects can share one database — the collections (`problems`,
`submissions`, `contests`) do not collide with `quizzes`, `rooms` or `attempts`.

## 4. Link it up

Add an entry point from Quiz Mania's home page:

```jsx
<Link href="/arena">Level 2 — Backtracking</Link>
```

## Where the two projects disagree, and why it matters

Quiz Mania's README flags that its socket middleware trusts whatever `playerId`
a client sends, so a player can claim any identity including the host's. **This
project does not have that gap** — `src/lib/auth.js` verifies an HS256 JWT on
both the HTTP API and the socket handshake, and rejects `alg: none`.

After the merge, point Quiz Mania's socket auth at the same `auth.js` and its
`lib/player.js` placeholder disappears. Until that happens the two halves have
different trust models, which is worth being deliberate about rather than
discovering during the contest.

## Deployment note

The judge queue (`src/lib/judge/queue.js`) and the submit rate limiter
(`src/lib/rateLimit.js`) hold state in the process — the same single-instance
caveat Quiz Mania already documents for its socket state. Run one instance, or
move all three to Redis together.

The host needs `gcc` and `bwrap` installed, and unprivileged user namespaces
enabled (`/proc/sys/kernel/unprivileged_userns_clone` = 1). Many managed
container platforms disable user namespaces, which breaks bubblewrap; if the
target host is one of those, reimplement `execSandbox` in
`src/lib/judge/sandbox.js` against Docker. That one function is the whole
isolation boundary — run `npm run test:judge` afterwards and it will tell you
whether the replacement actually contains anything.

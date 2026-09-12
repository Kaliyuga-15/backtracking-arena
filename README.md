# Backtracking Arena

Level 2 of the SCIS Connect competition: pattern-inference problems where the
contestant sees only inputs and the outputs they produce, works out the rule,
and writes C that reproduces it. Submitted code is compiled and run on the
server against hidden tests inside a sandbox.

Same stack as Quiz Mania — Next.js App Router, Socket.IO and MongoDB on one
custom Node server — and **no dependencies beyond the ones Quiz Mania already
has**, so merging the two is a file move rather than a package negotiation. See
[INTEGRATION.md](INTEGRATION.md).

## How it works

1. **A contestant opens a problem card.** The page shows sample inputs and the
   exact output they produce — that's the whole spec. No algorithm name, no
   pseudocode.
2. **They write C in the browser** (a plain textarea with line numbers — see
   "How code is executed" for why not a heavier editor) and press Submit.
3. **The server compiles their code with `gcc`** inside a sandbox, then runs
   the resulting binary once per test case — the public samples first, then a
   set of hidden tests the contestant never sees the input or expected output
   for, only pass/fail.
4. **Each test's output is compared** to the expected output (`src/lib/judge/compare.js`)
   and the submission is scored: partial credit for partial passes, full
   points only when every test passes (see "Scoring").
5. **The result is saved and the leaderboard is recomputed** from all
   submissions, then pushed live to every connected browser over Socket.IO —
   nobody needs to refresh to see standings move.
6. **An admin controls the contest clock** from `/admin`: start, extend,
   freeze, or end. The server's clock is authoritative; the countdown shown to
   contestants is derived from it, not from their own machine's time.

The one-sentence version: **inputs and outputs teach the pattern, hidden tests
enforce it, a sandbox keeps arbitrary C safe to run, and everything scores and
updates live.**

## Dependencies

**Runtime (npm, see `package.json`):**

| Package | Used for |
| --- | --- |
| `next` | App Router pages, API routes, the production server build |
| `react` / `react-dom` | UI components |
| `mongoose` | Schemas for Problem, Submission, Contest |
| `socket.io` | Live contest state + leaderboard push to the browser |
| `socket.io-client` | Browser side of the above |

**Dev-only (npm):** `tailwindcss` + `@tailwindcss/postcss` (styling), `eslint` +
`eslint-config-next` (linting). None of these ship to production.

That's the whole runtime dependency list — no code-execution or sandboxing
library. Compiling and running untrusted C is done by shelling out to tools
already on the host:

**System (must be installed separately, not via npm):**

| Tool | Used for |
| --- | --- |
| `gcc` | Compiles each submission (`-O2 -std=c11`) |
| `bwrap` (bubblewrap) | Sandboxes both the compile and the run — no network, private namespaces, read-only filesystem |
| `prlimit` (util-linux, preinstalled on virtually every Linux distro) | Enforces CPU time, memory and output-size limits before `bwrap` even starts |

**External services:**

| Service | Purpose |
| --- | --- |
| MongoDB | Stores problems, submissions, contest state |
| The main SCIS Connect auth project | Issues the JWT this service verifies (see `AUTH_JWT_SECRET` below). Not a code dependency — just the identity source in production. |

## Getting started

```bash
npm install
cp .env.example .env.local     # defaults target a local mongod
npm run seed:problems          # generates answer keys by running the references
npm run dev                    # http://localhost:4100
```

Open the app, enter a name (top right), then open `/admin` as `dev-admin` and
press **Start**. Submissions are refused until the contest is running.

Requires `gcc` and `bwrap` (bubblewrap) on the host:

```bash
sudo apt install gcc bubblewrap
```

## Verifying it works

| Command | Checks |
| --- | --- |
| `npm run test:judge` | Sandbox correctness and containment. Needs no DB and no `npm install`. |
| `node scripts/testApi.js` | Auth, contest gate, partial credit, leaderboard, answer-key leakage. Needs a running server. |
| `node scripts/loadTest.js 100` | Throughput with a full field submitting at once. |

Measured on 4 cores / 9GB with `JUDGE_CONCURRENCY=3`: 100 simultaneous
submissions all judged in **8.6s** (11.6/sec, p50 5.3s, max 8.6s). That is the
pathological case where every contestant submits in the same instant; spread
across a real contest window the queue never builds up.

## How code is executed

`gcc` and the contestant's binary both run under **bubblewrap**, not Docker.
Namespace setup costs ~5ms against Docker's ~300ms, which is what makes ~100
contestants affordable on a small box. Isolation is layered:

| Layer | Enforces |
| --- | --- |
| `prlimit` | CPU seconds, address space, output file size, open files |
| `bwrap` | No network, private PID/IPC/UTS namespaces, read-only `/usr`, tmpfs `/tmp`, no `/etc` or `/home` |
| Node | Wall-clock kill, stdout byte cap, per-submission run budget |

Compilation happens **once per submission**, then the binary is run against
every test — container-per-test would multiply the startup cost by the number
of cases.

`scripts/testJudge.js` asserts the containment properties directly: network
egress is refused, `/etc/passwd` is absent, infinite loops become TLE, and a
fork bomb is capped rather than taking the host down.

Two limits are deliberate and worth knowing:

- **`RLIMIT_NPROC` is not used.** It is per-UID rather than per-sandbox, so
  setting it below the account's live process count makes `clone()` fail and
  every judge run dies. Fork bombs are contained by the CPU limit and the
  wall-clock kill instead.
- **A submission has a total run budget** (`maxTotalRunMs`, default 12s). Without
  it, a program that times out on all eight tests would pin a worker for
  `8 x timeLimit`. Cases past the budget are reported as skipped.

Swapping in Docker means reimplementing `execSandbox` in
`src/lib/judge/sandbox.js` — nothing above that file knows how isolation happens.

## Scoring

Partial credit: each test carries an equal slice of the problem's points, and a
full pass always awards exactly `points`. A contestant's result for a problem is
their best submission; ties resolve to whoever got there first. The leaderboard
is derived from submissions on every read, so a rejudge or a retired problem can
never leave a stale standing behind.

## Adding or changing problems

Problems are documents, not code. Add an entry to `scripts/problemCards.js` and
re-run `npm run seed:problems`; the seeder compiles the card's
`referenceSolution` and runs it against every input to produce the expected
output. **A card can never ship an answer key that disagrees with its own
reference**, which is where hand-written judge data usually goes wrong.

At runtime, `PATCH /api/arena/problems/:slug` edits any field and
`DELETE` archives a card — archive rather than drop, because submissions
reference the slug. `hiddenTests` and `referenceSolution` are `select: false`,
so a careless query cannot ship the answer key to a client, the same way Quiz
Mania hides `isCorrect`.

The five seeded cards are binary strings, permutations, k-subsets, balanced
parentheses and an N-Queens count. Titles are deliberately neutral — naming card
5 "N-Queens" would hand over the algorithm.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | Combined HTTP + Socket.IO port (default `4100`) |
| `MONGODB_URI` | Mongo connection string |
| `NEXT_PUBLIC_SOCKET_URL` | Origin the browser dials for sockets |
| `AUTH_JWT_SECRET` | HS256 secret for tokens issued by the auth project |
| `AUTH_JWT_ISSUER` | Optional `iss` claim to require |
| `ALLOW_DEV_AUTH` | `true` accepts `x-dev-user-id`. **Set to `false` in production.** |
| `ADMIN_USER_IDS` | Comma-separated ids allowed to run the contest |
| `JUDGE_CONCURRENCY` | Submissions judged in parallel (default 3) |
| `JUDGE_SUBMIT_COOLDOWN_MS` | Per-contestant gap between submissions (default 5000) |

## Before the real contest

- [ ] `ALLOW_DEV_AUTH=false` and `AUTH_JWT_SECRET` set, or anyone can claim any identity
- [ ] `ADMIN_USER_IDS` set to real ids
- [ ] `npm run test:judge` passes on the actual contest host, not just here
- [ ] `node scripts/loadTest.js 100` against that host to pick `JUDGE_CONCURRENCY`
- [ ] Judge queue and rate limiter are per-process — run **one** instance, or move both to Redis

## Layout

```
server.js                        Next + Socket.IO on one port
scripts/
  problemCards.js                the problem set (edit this to add cards)
  seedProblems.js                derives answer keys by running references
  testJudge.js                   sandbox correctness + containment
  testApi.js                     end-to-end API checks
  loadTest.js                    concurrent submission benchmark
src/
  app/
    page.js                      problem cards + live standings
    arena/[slug]/page.js         pattern, editor, verdict
    admin/page.js                start/extend/freeze/end
    api/arena/                   problems, submissions, contest, leaderboard
  components/                    editor, samples, verdict, leaderboard, timer
  hooks/useArena.js              contest state + standings over Socket.IO
  lib/
    judge/                       sandbox, compile, compare, queue
    auth.js                      JWT verification + dev fallback
    scoring.js                   partial credit + tiebreak
    rateLimit.js                 per-contestant submit throttle
    realtime.js                  throttled leaderboard broadcast
  models/                        Problem, Submission, Contest
```

# Backtracking Arena

Level 2 of the SCIS Connect competition: pattern-inference problems where the
contestant types inputs into a terminal, reads what a hidden program prints,
works out the rule, and writes C that reproduces it. Submitted code is graded
against hidden tests on the **campus code execution engine** (or a local
bubblewrap sandbox during development).

Same stack as Quiz Mania — Next.js App Router, Socket.IO and MongoDB on one
custom Node server — and **no dependencies beyond the ones Quiz Mania already
has**. See [INTEGRATION.md](INTEGRATION.md).

## How it works

1. **A contestant opens a problem card.** It shows the input format and the
   constraints — no example outputs, no algorithm name.
2. **They explore in the terminal.** Typing any value inside the constraints
   (say `6`) and pressing Enter prints the hidden reference program's output
   for it. Earlier inputs and outputs stay in the scrollback so the pattern can
   be read across runs. Tries are unlimited.
3. **They write C in the browser** and press Submit.
4. **The backend sends one request to the code execution engine** with the
   source and every test case: small tests (a failure shows an expected/actual
   diff) and larger tests (pass/fail only), all inside the constraints. The engine compiles, runs and returns per-test verdicts.
5. **The submission is scored** with partial credit and saved; the leaderboard
   is recomputed and pushed live to every browser over Socket.IO.
6. **An admin controls the clock** from `/admin`: start, extend, freeze, end.
   The terminal and submissions both open when the contest starts.

**Every value inside a card's constraints has an answer** — no card ever prints
`none` or `0`. Each card has **one range** (`fields` in `problemCards.js`): it is
what the card displays, exactly what the terminal accepts, and where every
judge test comes from.

### Known trade-off: outputs can be copied

Because the terminal accepts the whole range, a contestant can type the values
the judge will use and hardcode the outputs. On the listing cards (1-3) that
means pasting hundreds of kilobytes, which is impractical; on the counting cards
(5-9) each answer is one number, so a lookup table is feasible. This was a
deliberate choice in favour of one honest, matching range. If it becomes a
problem, the fix is to let the hidden tests go beyond the displayed range again.

### Why the terminal never runs code during the contest

At seed time the reference program is run for **every input each terminal
accepts** (28,870 values across the ten cards) and the outputs are stored in
MongoDB. During the contest the terminal is a database lookup: instant, and it
puts zero load on the shared engine, which runs only four programs at a time
for everyone. It also means every terminal output can be audited before the
contest (`npm run verify:cards`).

## Dependencies

**Runtime (npm):** `next`, `react` / `react-dom`, `mongoose`, `socket.io`,
`socket.io-client`. **Dev only:** `tailwindcss`, `@tailwindcss/postcss`,
`eslint`, `eslint-config-next`. The engine client uses Node's built-in
`https` — no HTTP library.

**Services:**

| Service | Purpose |
| --- | --- |
| MongoDB | Problems, stored terminal outputs, submissions, contest state |
| Campus code execution engine | Compiles and runs submitted C (`JUDGE_BACKEND=engine`). Reachable only from the campus/private network. |
| SCIS Connect auth project | Issues the JWT this service verifies (`AUTH_JWT_SECRET`) |

**System tools** — only for `JUDGE_BACKEND=local` and for the test scripts:
`gcc`, `bwrap` (bubblewrap), `prlimit` (util-linux).

## Getting started

```bash
npm install
cp .env.example .env.local      # then fill in the values below
npm run seed:problems           # answer keys + every terminal output
npm run verify:cards            # audit all ten cards (must print "all cards verified")
npm run dev                     # http://localhost:4100
```

Open the app, enter a name (top right), open `/admin` as `dev-admin`, press
**Start**.

## Code execution engine

Configured per the engine's API integration guide:

```bash
JUDGE_BACKEND=engine
QUERY_SERVER_URL=https://10.5.1.36/grader
QUERY_SERVER_API_KEY=<from the engine administrator>      # .env.local only, never committed
QUERY_SERVER_CA_CERT=./certs/scis-connect-ca.crt           # SCIS Connect Internal CA
ENGINE_CONCURRENCY=3
```

- **The API key stays server-side.** It is read only by
  `src/lib/engine/client.js`, which runs in the Node backend; nothing under
  `src/components` can see it. `.env.local` and `certs/*.crt` are git-ignored.
- **TLS is verified** against `QUERY_SERVER_CA_CERT`. Verification is never
  turned off; a wrong or missing CA fails loudly. The engine presents a
  certificate for `10.5.1.36` issued by *SCIS Connect Internal CA* (SHA-256
  fingerprint `6B:96:31:FE:63:E9:D2:E1:AE:1F:29:91:D0:C2:92:E7:D0:5F:CD:24:E9:32:BD:F9:AE:60:F5:8D:DC:49:33:9B`) —
  confirm the CA file you receive matches it.
- **Capacity:** one engine request per submission, at most `ENGINE_CONCURRENCY`
  (≤ 4) in flight; bursts queue in the backend instead of hitting the engine.
  HTTP 502/503/504 and connection errors are retried with backoff (about 45s),
  as the guide asks.
- **An engine outage is not scored.** The contestant gets "not scored, submit
  again"; no submission is recorded and no cooldown starts.
- **Output comparison:** the engine's comparison rules are not documented, so a
  "Wrong Answer" from the engine is re-checked with this platform's rule
  (trailing spaces and final newlines ignored), so the engine is never stricter
  than the local judge. If the engine is more lenient (say it ignores all
  whitespace), its "Accepted" stands; `check:engine` reports which rules it uses.
- Engine verdicts map to Accepted, Wrong Answer, Compile Error, Runtime Error,
  Time Limit Exceeded, Memory Limit Exceeded, Output Limit Exceeded and Judge
  Error.

**Turning it on:** from a machine on the campus network, with the CA file in
`certs/`:

```bash
npm run check:engine   # health, API key, every verdict, output handling, all ten cards on the real engine
```

When it passes, set `JUDGE_BACKEND=engine` and restart. `check:engine` also
reports how the engine treats trailing newlines and confirms stdout up to 1MB
comes back complete (card 3's largest test prints 720KB).

Without campus access, `npm run test:engine` exercises the same integration
against `scripts/mockEngine.js` — an HTTPS stand-in implementing the guide's
API with its own private CA, a 503 on the first run, and exact output
comparison.

## Verifying it works

| Command | Checks |
| --- | --- |
| `npm run verify:cards` | For **every** value of every card (28,870): an independent JavaScript answer (brute force, or BigInt DP / known sequences where brute force is infeasible) must equal both the stored terminal output and a fresh run of the reference; each value must have an answer and stay within half the time limit and the output cap. |
| `npm run check:engine` | The real campus engine (see above). |
| `npm run test:engine` | Engine client against the mock: TLS/CA pinning, bad key, 503 retry, verdict mapping, outage handling, every card through the engine path. |
| `node scripts/testApi.js` | Auth, contest gate, terminal range/format checks, partial credit, leaderboard, answer-key leakage. Needs a running server. |
| `npm run test:judge` | Local sandbox correctness and containment. |
| `node scripts/loadTest.js 100` | Throughput with a full field submitting at once. |

`verify:cards` was mutation-tested: planting a wrong stored output on two cards
makes it fail on exactly those two.

## The ten cards

Titles are neutral — naming card 9 "N-Queens" would hand over the algorithm.

| # | Card | Actually is | Constraints (= terminal) |
| --- | --- | --- | --- |
| 1 | Distinct Pieces | partitions of n into distinct parts | 1 ≤ n ≤ 60 |
| 2 | No Long Runs | binary strings of length n with no k consecutive 1s | 1 ≤ n ≤ 16, 2 ≤ k ≤ 4 |
| 3 | No Echoes | strings over k letters with no palindrome of length 2 or 3 | 1 ≤ n ≤ 14, 3 ≤ k ≤ 4 |
| 4 | Round Table | smallest prime ring of 1..2m | 1 ≤ m ≤ 20 |
| 5 | Shallow Nesting | count bracket sequences of n pairs with depth ≤ d | 1 ≤ n, d ≤ 30 |
| 6 | Balanced Picks | count subsets of 1..n with sum divisible by m | 1 ≤ n, m ≤ 40 |
| 7 | Knight Walks | count L-move knight walks from a corner of an n×n board | 3 ≤ n ≤ 12, 0 ≤ L ≤ 16 |
| 8 | Seating Rules | count divisor-compatible seatings of n people | 1 ≤ n ≤ 20 |
| 9 | Safe Placements | N-Queens count | 4 ≤ n ≤ 14 |
| 10 | Between the Digits | first closest expression inserting +, - or nothing between digits 1..n | 1 ≤ n ≤ 13, -1000 ≤ t ≤ 1000 |

On the hard cards a naive search is fine for small values but not at the top
of the range: answers reach 3.8×10¹⁵ (card 5), 1.1×10¹² (card 6) and 4.8×10¹²
(card 7), so they need memoisation or pruning.

## Adding or changing problems

Problems are data. Add an entry to `scripts/problemCards.js` and run
`npm run seed:problems && npm run verify:cards`. A card defines:

- `fields` — one `{ name, min, max }` per input integer; the displayed
  constraints, the terminal and the judge all use it
- `visibleInputs` (small tests) and `hiddenInputs` (larger tests), both inside
  `fields`
- `referenceSolution` — expected outputs and terminal outputs are generated by
  running it, never typed by hand

The seeder rejects a card if a test input is outside its range, any output is empty,
`none` or `0`, or the reference is slow or too large. `verify:cards` additionally
needs a brute force for the new card's slug. Cards removed from the file are
archived; `hiddenTests` and `referenceSolution` are `select: false`, so a
careless query cannot ship them to a client.

## Local backend note: namespace limit

Each local sandbox creates Linux namespaces, which the kernel frees lazily.
Tens of thousands of runs in a few minutes (seeding card 10 runs 26,013) can hit
the per-user limit and fail with `bwrap: Creating new namespace failed: No space
left on device`. The sandbox retries those automatically, admin tooling waits
for the kernel, and a submission that still hits it is returned as "not scored,
submit again" — never as the contestant's Runtime Error. With
`JUDGE_BACKEND=engine` submissions don't use local sandboxes at all.

## Scoring

Partial credit: each test carries an equal slice of the problem's points, and a
full pass always awards exactly `points`. A contestant's result for a problem is
their best submission; ties resolve to whoever got there first.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT`, `MONGODB_URI`, `NEXT_PUBLIC_SOCKET_URL` | Server, database, socket origin |
| `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER` | Tokens issued by the auth project |
| `ALLOW_DEV_AUTH` | `true` accepts `x-dev-user-id`. **`false` in production.** |
| `ADMIN_USER_IDS` | Ids allowed to run the contest |
| `JUDGE_BACKEND` | `engine` (campus engine) or `local` (bubblewrap) |
| `QUERY_SERVER_URL`, `QUERY_SERVER_API_KEY`, `QUERY_SERVER_CA_CERT` | Engine endpoint, secret key, CA certificate path |
| `ENGINE_CONCURRENCY` | Engine requests in flight (default 3, max 4) |
| `JUDGE_SUBMIT_COOLDOWN_MS` | Per-contestant gap between submissions (default 5000) |
| `JUDGE_CONCURRENCY`, `JUDGE_WORKDIR` | Local backend only |

## Before the real contest

- [ ] CA certificate in `certs/`, `npm run check:engine` passes from the contest backend, `JUDGE_BACKEND=engine`
- [ ] `npm run seed:problems` then `npm run verify:cards` prints "all cards verified"
- [ ] `ALLOW_DEV_AUTH=false` and `AUTH_JWT_SECRET` set, or anyone can claim any identity
- [ ] `ADMIN_USER_IDS` set to real ids
- [ ] Run **one** app instance — the engine queue and rate limiter are per-process

## Layout

```
server.js                        Next + Socket.IO on one port
certs/                           engine CA certificate (git-ignored)
scripts/
  problemCards.js                the problem set
  seedProblems.js                answer keys + all terminal outputs
  verifyCards.js                 full audit against independent brute forces
  checkEngine.js                 real campus engine checks
  mockEngine.js, testEngineClient.js   engine integration without campus access
  testApi.js, testJudge.js, loadTest.js
src/
  app/api/arena/                 problems (+ /run terminal), submissions, contest, leaderboard
  components/                    Terminal, CodeEditor, VerdictPanel, leaderboard, timer
  lib/
    engine/client.js             campus engine client (TLS, key, retry, concurrency)
    judge/                       engine + local backends, compare, sandbox
    playground.js                terminal parsing + constraint formatting
  models/                        Problem, TerminalOutput, Submission, Contest
```

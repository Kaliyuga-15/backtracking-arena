// End-to-end check against a running server:
//
//   npm run dev            (in another terminal)
//   node scripts/testApi.js
//
// Exercises auth, the contest gate, the exploration terminal, judging, partial
// credit and leaderboard ordering. Each judged submission uses a distinct
// contestant so the per-user submit cooldown does not serialise the run.

const BASE = process.env.ARENA_BASE_URL || 'http://localhost:4100';
const CONTEST_KEY = 'backtracking';
const SLUG = 'distinct-pieces';

const as = (userId, name) => ({ 'x-dev-user-id': userId, 'x-dev-user-name': name ?? userId });

const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
};

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`ok    ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
};

// Partitions of n into distinct parts, largest part first.
const CORRECT = `#include <stdio.h>
static int n, part[80];
static void rec(int idx, int rem, int maxp) {
  if (rem == 0) { for (int i = 0; i < idx; i++) printf("%d%c", part[i], i + 1 == idx ? '\\n' : ' '); return; }
  for (int p = rem < maxp ? rem : maxp; p >= 1; p--) { if ((long long)p * (p + 1) / 2 < rem) break; part[idx] = p; rec(idx + 1, rem - p, p - 1); }
}
int main(void) { if (scanf("%d", &n) != 1) return 1; rec(0, n, n); return 0; }
`;

// Right rule, but gives up above the terminal range: passes the small tests,
// fails the large ones. Exactly the partial-credit case.
const SMALL_ONLY = CORRECT.replace('rec(0, n, n);', 'if (n > 40) return 0; rec(0, n, n);');

const run = async () => {
  // --- auth ---------------------------------------------------------------
  const anon = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: SLUG, source: CORRECT },
  });
  check('anonymous submission rejected', anon.status === 401, `got ${anon.status}`);

  const anonTerminal = await call(`/api/arena/problems/${SLUG}/run`, {
    method: 'POST',
    body: { input: '6' },
  });
  check('anonymous terminal run rejected', anonTerminal.status === 401, `got ${anonTerminal.status}`);

  const notAdmin = await call('/api/arena/contest', {
    method: 'PATCH',
    body: { action: 'start' },
    headers: as('random-student'),
  });
  check('non-admin cannot start contest', notAdmin.status === 403, `got ${notAdmin.status}`);

  // --- contest gate -------------------------------------------------------
  await call('/api/arena/contest', { method: 'PATCH', body: { action: 'reset' }, headers: as('dev-admin') });

  const beforeStart = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: SLUG, source: CORRECT },
    headers: as('early-bird'),
  });
  check('submission blocked before start', beforeStart.status === 409, `got ${beforeStart.status}`);

  const terminalBeforeStart = await call(`/api/arena/problems/${SLUG}/run`, {
    method: 'POST',
    body: { input: '6' },
    headers: as('early-bird'),
  });
  check('terminal closed before start', terminalBeforeStart.status === 409, `got ${terminalBeforeStart.status}`);

  const started = await call('/api/arena/contest', {
    method: 'PATCH',
    body: { action: 'start', durationMinutes: 60 },
    headers: as('dev-admin'),
  });
  check('admin starts contest', started.payload?.data?.accepting === true);

  // --- terminal -----------------------------------------------------------
  const explored = await call(`/api/arena/problems/${SLUG}/run`, {
    method: 'POST',
    body: { input: '  6 ' },
    headers: as('explorer'),
  });
  check(
    'terminal runs reference on valid input',
    explored.status === 200 && explored.payload?.data?.output === '6\n5 1\n4 2\n3 2 1\n',
    `status=${explored.status} output=${JSON.stringify(explored.payload?.data?.output)}`
  );

  const outOfRange = await call(`/api/arena/problems/${SLUG}/run`, {
    method: 'POST',
    body: { input: '61' },
    headers: as('explorer'),
  });
  check('terminal rejects values outside the constraints', outOfRange.status === 422, `got ${outOfRange.status}`);

  const wrongArity = await call(`/api/arena/problems/${SLUG}/run`, {
    method: 'POST',
    body: { input: '6 1' },
    headers: as('explorer'),
  });
  check('terminal rejects wrong number of values', wrongArity.status === 422, `got ${wrongArity.status}`);

  const injection = await call(`/api/arena/problems/${SLUG}/run`, {
    method: 'POST',
    body: { input: '6; cat /etc/passwd' },
    headers: as('explorer'),
  });
  check('terminal rejects non-integer tokens', injection.status === 422, `got ${injection.status}`);

  // --- card never exposes outputs -----------------------------------------
  const detail = await call(`/api/arena/problems/${SLUG}`);
  const serialized = JSON.stringify(detail.payload?.data ?? {});
  check(
    'problem detail hides tests and reference',
    !serialized.includes('samples') && !serialized.includes('hiddenTests') && !serialized.includes('referenceSolution'),
    'test data present in problem detail'
  );

  const list = await call('/api/arena/problems');
  check(
    'problem list carries ranges, no outputs',
    Array.isArray(list.payload?.data) &&
      list.payload.data.length === 10 &&
      list.payload.data.every((p) => p.judgeFields?.length && p.terminalFields?.length && !('samples' in p)),
    `${list.payload?.data?.length} problems`
  );

  // --- judging ------------------------------------------------------------
  const accepted = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: SLUG, source: CORRECT },
    headers: as('ada', 'Ada'),
  });
  const acceptedData = accepted.payload?.data;
  check(
    'correct solution accepted with full points',
    acceptedData?.verdict === 'accepted' && acceptedData?.score === 150,
    `verdict=${acceptedData?.verdict} score=${acceptedData?.score}`
  );

  const partial = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: SLUG, source: SMALL_ONLY },
    headers: as('linus', 'Linus'),
  });
  const partialData = partial.payload?.data;
  check(
    'terminal-range-only solution earns partial credit',
    partialData?.verdict === 'wrong_answer' && partialData.score > 0 && partialData.score < 150,
    `verdict=${partialData?.verdict} score=${partialData?.score} passed=${partialData?.passed}/${partialData?.total}`
  );

  const largeEntries = (partialData?.testResults ?? []).filter((t) => !t.visible);
  check(
    'large tests report status only',
    largeEntries.length > 0 && largeEntries.every((t) => !t.expectedOutput && !t.input && !t.actualOutput),
    `${largeEntries.length} large entries`
  );

  // --- rate limit ---------------------------------------------------------
  const rapid = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: SLUG, source: CORRECT },
    headers: as('ada', 'Ada'),
  });
  check('per-user submit cooldown enforced', rapid.status === 429, `got ${rapid.status}`);

  // --- leaderboard --------------------------------------------------------
  const board = await call(`/api/arena/leaderboard?key=${CONTEST_KEY}`);
  const rows = board.payload?.data ?? [];
  const ada = rows.find((r) => r.userId === 'ada');
  const linus = rows.find((r) => r.userId === 'linus');
  check(
    'leaderboard ranks full solve above partial',
    ada && linus && ada.rank < linus.rank,
    `ada=${ada?.rank}/${ada?.totalScore} linus=${linus?.rank}/${linus?.totalScore}`
  );

  console.log(failures === 0 ? '\nall api checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

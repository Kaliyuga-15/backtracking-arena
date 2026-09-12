// End-to-end check against a running server:
//
//   npm run dev            (in another terminal)
//   node scripts/testApi.js
//
// Exercises auth, the contest gate, judging, partial credit and leaderboard
// ordering. Each assertion uses a distinct contestant so the per-user submit
// cooldown does not serialise the run.

const BASE = process.env.ARENA_BASE_URL || 'http://localhost:4100';
const CONTEST_KEY = 'backtracking';

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

const CORRECT_SWITCHES = `#include <stdio.h>
static int n; static char b[40];
static void rec(int i){ if(i==n){ b[n]=0; printf("%s\\n", b); return; }
  b[i]='0'; rec(i+1); b[i]='1'; rec(i+1); }
int main(void){ if(scanf("%d",&n)!=1) return 1; rec(0); return 0; }
`;

// Correct only for n == 1, so it passes the first sample and fails the rest:
// exactly the partial-credit case.
const PARTIAL_SWITCHES = `#include <stdio.h>
int main(void){ int n; if(scanf("%d",&n)!=1) return 1; printf("0\\n1\\n"); return 0; }
`;

const run = async () => {
  // --- auth ---------------------------------------------------------------
  const anon = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: 'switches', source: CORRECT_SWITCHES },
  });
  check('anonymous submission rejected', anon.status === 401, `got ${anon.status}`);

  const notAdmin = await call('/api/arena/contest', {
    method: 'PATCH',
    body: { action: 'start' },
    headers: as('random-student'),
  });
  check('non-admin cannot start contest', notAdmin.status === 403, `got ${notAdmin.status}`);

  // --- contest gate -------------------------------------------------------
  await call('/api/arena/contest', {
    method: 'PATCH',
    body: { action: 'reset' },
    headers: as('dev-admin'),
  });

  const beforeStart = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: 'switches', source: CORRECT_SWITCHES },
    headers: as('early-bird'),
  });
  check('submission blocked before start', beforeStart.status === 409, `got ${beforeStart.status}`);

  const started = await call('/api/arena/contest', {
    method: 'PATCH',
    body: { action: 'start', durationMinutes: 60 },
    headers: as('dev-admin'),
  });
  check('admin starts contest', started.payload?.data?.accepting === true);

  // --- judging ------------------------------------------------------------
  const accepted = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: 'switches', source: CORRECT_SWITCHES },
    headers: as('ada', 'Ada'),
  });
  const acceptedData = accepted.payload?.data;
  check(
    'correct solution accepted with full points',
    acceptedData?.verdict === 'accepted' && acceptedData?.score === 100,
    `verdict=${acceptedData?.verdict} score=${acceptedData?.score}`
  );

  const partial = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: 'switches', source: PARTIAL_SWITCHES },
    headers: as('linus', 'Linus'),
  });
  const partialData = partial.payload?.data;
  check(
    'partial solution earns partial credit',
    partialData?.verdict === 'wrong_answer' &&
      partialData.score > 0 &&
      partialData.score < 100,
    `verdict=${partialData?.verdict} score=${partialData?.score} passed=${partialData?.passed}/${partialData?.total}`
  );

  const hiddenLeak = JSON.stringify(partialData?.testResults ?? []);
  check(
    'hidden test data withheld from results',
    !hiddenLeak.includes('"expectedOutput":"0\\n1\\n0'),
    'a hidden expected output appeared in the response'
  );
  const hiddenEntries = (partialData?.testResults ?? []).filter((t) => !t.visible);
  check(
    'hidden cases report status only',
    hiddenEntries.length > 0 && hiddenEntries.every((t) => !t.expectedOutput && !t.input),
    `${hiddenEntries.length} hidden entries`
  );

  // --- rate limit ---------------------------------------------------------
  const rapid = await call('/api/arena/submissions', {
    method: 'POST',
    body: { problemSlug: 'switches', source: CORRECT_SWITCHES },
    headers: as('ada', 'Ada'),
  });
  check('per-user cooldown enforced', rapid.status === 429, `got ${rapid.status}`);

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

  // --- problem visibility -------------------------------------------------
  const publicProblem = await call('/api/arena/problems/switches');
  const serialized = JSON.stringify(publicProblem.payload?.data ?? {});
  check(
    'problem detail hides answer key',
    !serialized.includes('hiddenTests') && !serialized.includes('referenceSolution'),
    'answer key present in problem detail'
  );

  console.log(failures === 0 ? '\nall api checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

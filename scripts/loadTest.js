// Throws a full contest field at the judge at once to size the box before the
// real event:
//
//   node scripts/loadTest.js [users]
//
// Every simulated contestant submits simultaneously, which is the worst case --
// in a real contest submissions arrive spread over the window.

const BASE = process.env.ARENA_BASE_URL || 'http://localhost:4100';
const USERS = Number.parseInt(process.argv[2] ?? '100', 10);

// Card 1 (distinct partitions). Its largest test prints ~150KB, so this
// measures output-heavy judging, not just process startup.
const SOLUTION = `#include <stdio.h>
static int n, part[80];
static void rec(int idx, int rem, int maxp) {
  if (rem == 0) { for (int i = 0; i < idx; i++) printf("%d%c", part[i], i + 1 == idx ? '\\n' : ' '); return; }
  for (int p = rem < maxp ? rem : maxp; p >= 1; p--) { if ((long long)p * (p + 1) / 2 < rem) break; part[idx] = p; rec(idx + 1, rem - p, p - 1); }
}
int main(void) { if (scanf("%d", &n) != 1) return 1; rec(0, n, n); return 0; }
`;

const submit = async (index) => {
  const startedAt = Date.now();
  const response = await fetch(`${BASE}/api/arena/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-dev-user-id': `load-${index}`,
      'x-dev-user-name': `Load ${index}`,
    },
    body: JSON.stringify({ problemSlug: 'distinct-pieces', source: SOLUTION }),
  });

  const payload = await response.json().catch(() => null);
  return {
    ok: response.status === 201 && payload?.data?.verdict === 'accepted',
    status: response.status,
    latencyMs: Date.now() - startedAt,
  };
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const run = async () => {
  console.log(`Firing ${USERS} simultaneous submissions at ${BASE} ...\n`);

  const startedAt = Date.now();
  const results = await Promise.all(Array.from({ length: USERS }, (_, i) => submit(i)));
  const wallSeconds = (Date.now() - startedAt) / 1000;

  const accepted = results.filter((r) => r.ok).length;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  const statuses = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`accepted        ${accepted}/${USERS}`);
  console.log(`statuses        ${JSON.stringify(statuses)}`);
  console.log(`wall clock      ${wallSeconds.toFixed(1)}s`);
  console.log(`throughput      ${(USERS / wallSeconds).toFixed(1)} submissions/sec`);
  console.log(`latency p50     ${percentile(latencies, 50)}ms`);
  console.log(`latency p95     ${percentile(latencies, 95)}ms`);
  console.log(`latency max     ${latencies[latencies.length - 1]}ms`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

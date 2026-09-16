// Checks the campus code execution engine before switching JUDGE_BACKEND to
// "engine". Run it from a machine on the campus network with the CA in place:
//
//   npm run check:engine
//
// Sends requests one at a time (the engine runs 4 programs for everyone).
// Covers the guide's integration checklist plus the behaviour this platform
// depends on: how output is compared, and whether large stdout comes back
// complete (needed to seed answer keys and terminal outputs on the engine).

import './env.js';
import { EngineError, engineHealth, engineStats, runOnEngine } from '../src/lib/engine/client.js';
import { judgeWithEngine } from '../src/lib/judge/engine.js';
import { problemCards } from './problemCards.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Problem } from '../src/models/Problem.js';

let failures = 0;
const report = (ok, name, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};
const info = (name, detail) => console.log(`info  ${name} - ${detail}`);

const run1 = (source, testcases, extra = {}) =>
  runOnEngine({ source, testcases, timeLimitMs: 2000, memoryMb: 256, ...extra });

const verdictOf = (response, index = 0) => response?.results?.find((r) => r.index === index)?.verdict;

const main = async () => {
  // --- connectivity and auth -----------------------------------------------
  try {
    const health = await engineHealth();
    report(health?.status === 'ok', 'GET /health', JSON.stringify(health));
  } catch (err) {
    report(false, 'GET /health', err.message);
    console.log('\nCannot reach the engine; later checks would only repeat this error.');
    process.exit(1);
  }

  try {
    const stats = await engineStats();
    report(true, 'GET /api/v2/stats (API key accepted)', JSON.stringify(stats).slice(0, 160));
  } catch (err) {
    report(false, 'GET /api/v2/stats', err.message);
    process.exit(1);
  }

  // --- verdicts ----------------------------------------------------------------
  const hello = await run1('#include <stdio.h>\nint main(){printf("Hello World");return 0;}', [{ input: '', output: 'Hello World' }]);
  report(hello?.summary?.verdict === 'Accepted', 'Hello World accepted', JSON.stringify(hello?.summary));

  const sum = await run1('#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d",a+b);return 0;}', [
    { input: '2 3', output: '5' },
    { input: '10 -4', output: '6' },
    { input: '1 1', output: '3' },
  ]);
  report(
    verdictOf(sum, 0) === 'Accepted' && verdictOf(sum, 1) === 'Accepted' && verdictOf(sum, 2) === 'Wrong Answer',
    'multiple test cases: pass, pass, wrong answer',
    (sum?.results ?? []).map((r) => r.verdict).join(', ')
  );

  const compileError = await run1('int main(){ this is not c }', [{ input: '', output: '' }]);
  report(compileError?.compile?.ok === false, 'compilation error reported', JSON.stringify(compileError?.summary));

  const crash = await run1('int main(){int*p=0;*p=1;return 0;}', [{ input: '', output: '' }]);
  report(verdictOf(crash) === 'Runtime Error', 'runtime error reported', verdictOf(crash));

  const loop = await run1('int main(){for(;;);}', [{ input: '', output: '' }], { timeLimitMs: 1000 });
  report(verdictOf(loop) === 'Time Limit Exceeded', 'infinite loop reported as TLE', verdictOf(loop));

  // --- comparison rules (informational: the judge re-checks wrong answers) ---
  const extraNewline = await run1('#include <stdio.h>\nint main(){printf("5\\n");return 0;}', [{ input: '', output: '5' }]);
  info('program prints "5\\n", expected "5"', verdictOf(extraNewline));
  const missingNewline = await run1('#include <stdio.h>\nint main(){printf("5");return 0;}', [{ input: '', output: '5\n' }]);
  info('program prints "5", expected "5\\n"', verdictOf(missingNewline));
  const trailingSpace = await run1('#include <stdio.h>\nint main(){printf("1 2 \\n");return 0;}', [{ input: '', output: '1 2\n' }]);
  info('program prints "1 2 \\n", expected "1 2\\n"', verdictOf(trailingSpace));
  const splitLines = await run1('#include <stdio.h>\nint main(){printf("1\\n2\\n");return 0;}', [{ input: '', output: '1 2\n' }]);
  info('program prints "1\\n2\\n", expected "1 2\\n" (Accepted here means the engine is more lenient than the platform)', verdictOf(splitLines));

  // --- large output fidelity --------------------------------------------------
  // Largest expected output on any card is ~720KB (card 3, "14 4").
  for (const kb of [128, 512, 800, 1000]) {
    const bytes = kb * 1024;
    const source = `#include <stdio.h>\nint main(){for(int i=0;i<${bytes};i++)putchar(i%64==63?'\\n':'a');return 0;}`;
    const response = await run1(source, [{ input: '', output: '' }]);
    const result = response?.results?.[0];
    const returned = typeof result?.stdout === 'string' ? Buffer.byteLength(result.stdout) : 0;
    const complete = ['Accepted', 'Wrong Answer'].includes(result?.verdict) && returned === bytes;
    report(complete, `${kb}KB stdout returned complete`, `verdict ${result?.verdict}, got ${returned} of ${bytes} bytes`);
  }

  // --- every card, judged exactly as a submission would be ----------------
  await connectDB();
  for (const card of problemCards) {
    const problem = await Problem.findOne({ slug: card.slug }).select('+hiddenTests').lean();
    if (!problem) {
      report(false, `card ${card.slug}`, 'not seeded');
      continue;
    }
    const plan = [
      ...problem.samples.map((s, i) => ({ label: `Small test ${i + 1}`, visible: true, input: s.input, expectedOutput: s.output })),
      ...problem.hiddenTests.map((t, i) => ({ label: `Large test ${i + 1}`, visible: false, input: t.input, expectedOutput: t.expectedOutput })),
    ];
    try {
      const judged = await judgeWithEngine({ source: card.referenceSolution, problem, plan });
      report(
        judged.verdict === 'accepted',
        `card ${card.slug}: reference accepted on the engine`,
        `${judged.passed}/${judged.total} in ${judged.durationMs}ms${judged.verdict === 'accepted' ? '' : `, ${judged.verdict}`}`
      );
    } catch (err) {
      report(false, `card ${card.slug}`, err.message);
    }
  }
  await disconnectDB();

  console.log(
    failures === 0
      ? '\nEngine ready. Set JUDGE_BACKEND=engine, then run `npm run seed:problems` and `npm run verify:cards`.'
      : `\n${failures} check(s) failed. Keep JUDGE_BACKEND=local until they pass.`
  );
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (err) => {
  console.error(err instanceof EngineError ? `Engine error: ${err.message}` : err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});

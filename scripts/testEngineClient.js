// Tests the engine integration against scripts/mockEngine.js: TLS against a
// private CA, API key handling, 503 retry, verdict mapping, the wrong-answer
// re-check, and every card judged through the engine code path.
//
//   npm run seed:problems   (once)
//   npm run test:engine
//
// Needs MongoDB and the local sandbox (the mock runs programs with it), but no
// campus network.

import './env.js';
import { startMockEngine, makeCertificates } from './mockEngine.js';
import { problemCards } from './problemCards.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const engine = await startMockEngine({ busyFirstRun: true });
process.env.JUDGE_BACKEND = 'engine';
process.env.QUERY_SERVER_URL = engine.url;
process.env.QUERY_SERVER_API_KEY = engine.apiKey;
process.env.QUERY_SERVER_CA_CERT = engine.caPath;
process.env.ENGINE_CONCURRENCY = '3';
process.env.ENGINE_RETRY_ATTEMPTS = '3';

const client = await import('../src/lib/engine/client.js');
const { judgeWithEngine, runInputsOnEngine } = await import('../src/lib/judge/engine.js');
const { judgeSubmission } = await import('../src/lib/judge/index.js');
const { connectDB, disconnectDB } = await import('../src/lib/db.js');
const { Problem } = await import('../src/models/Problem.js');
const { TerminalOutput } = await import('../src/models/TerminalOutput.js');

const resetAgent = () => {
  globalThis.__arenaEngine.agent = null;
};

try {
  // --- connectivity, TLS, auth, retry ------------------------------------------
  const health = await client.engineHealth();
  check('health over TLS with the private CA', health?.status === 'ok');

  const firstRun = await client.runOnEngine({
    source: '#include <stdio.h>\nint main(){printf("Hello World");return 0;}',
    testcases: [{ input: '', output: 'Hello World' }],
    timeLimitMs: 2000,
    memoryMb: 256,
  });
  check('503 "queue full" is retried until it succeeds', firstRun?.summary?.verdict === 'Accepted', JSON.stringify(firstRun?.summary));

  process.env.QUERY_SERVER_API_KEY = 'wrong-key';
  try {
    await client.engineStats();
    check('wrong API key is reported', false, 'request succeeded');
  } catch (err) {
    check('wrong API key is reported', /API key/.test(err.message), err.message);
  }
  process.env.QUERY_SERVER_API_KEY = engine.apiKey;

  const otherCa = makeCertificates('Somebody Else CA');
  process.env.QUERY_SERVER_CA_CERT = otherCa.caPath;
  resetAgent();
  try {
    await client.engineHealth();
    check('certificate from an untrusted CA is refused', false, 'connection succeeded');
  } catch (err) {
    check('certificate from an untrusted CA is refused', /TLS verification failed/.test(err.message), err.message);
  }
  process.env.QUERY_SERVER_CA_CERT = engine.caPath;
  resetAgent();
  (await import('node:fs')).rmSync(otherCa.dir, { recursive: true, force: true });

  // --- verdict mapping through the judge ---------------------------------------
  const problem = {
    timeLimitMs: 1000,
    memoryMb: 256,
    samples: [{ input: '2 3\n', output: '5\n' }],
    hiddenTests: [{ input: '10 -4\n', expectedOutput: '6\n' }],
  };
  const judge = (source) => judgeSubmission({ source, problem });

  const noNewline = await judge('#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d",a+b);return 0;}');
  check('missing final newline still accepted (wrong-answer re-check)', noNewline.verdict === 'accepted', `${noNewline.verdict} ${noNewline.passed}/${noNewline.total}`);

  const wrong = await judge('#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a-b);return 0;}');
  check('wrong answer', wrong.verdict === 'wrong_answer' && wrong.passed === 0, wrong.verdict);
  check('large test data withheld', wrong.testResults.filter((t) => !t.visible).every((t) => !t.input && !t.expectedOutput && !t.actualOutput));

  const compile = await judge('int main(){ nope }');
  check('compilation error', compile.verdict === 'compile_error' && compile.compileOutput.length > 0, compile.verdict);

  const crash = await judge('int main(){int*p=0;*p=1;return 0;}');
  check('runtime error', crash.verdict === 'runtime_error', crash.verdict);

  const loop = await judge('int main(){for(;;);}');
  check('time limit exceeded', loop.verdict === 'time_limit_exceeded', loop.verdict);

  // --- engine outage is not scored ---------------------------------------------
  process.env.QUERY_SERVER_URL = 'https://127.0.0.1:1/grader';
  resetAgent();
  const started = Date.now();
  try {
    await judge('int main(){return 0;}');
    check('engine outage raises 503 instead of scoring', false, 'returned a result');
  } catch (err) {
    check('engine outage raises 503 instead of scoring', err.status === 503, `${err.message} after ${Date.now() - started}ms of retries`);
  }
  process.env.QUERY_SERVER_URL = engine.url;
  resetAgent();

  // --- every card through the engine path ----------------------------------------
  await connectDB();
  for (const card of problemCards) {
    const stored = await Problem.findOne({ slug: card.slug }).select('+hiddenTests').lean();
    const plan = [
      ...stored.samples.map((s, i) => ({ label: `Small test ${i + 1}`, visible: true, input: s.input, expectedOutput: s.output })),
      ...stored.hiddenTests.map((t, i) => ({ label: `Large test ${i + 1}`, visible: false, input: t.input, expectedOutput: t.expectedOutput })),
    ];
    const judged = await judgeWithEngine({ source: card.referenceSolution, problem: stored, plan });

    const rows = await TerminalOutput.find({ slug: card.slug }).limit(25).lean();
    const terminal = await runInputsOnEngine({
      source: card.referenceSolution,
      inputs: rows.map((row) => `${row.input}\n`),
      timeLimitMs: 3000,
      memoryMb: 256,
    });
    const terminalMatches = terminal.ok && rows.every((row, i) => terminal.outputs[i] === row.output);

    check(
      `card ${card.slug}: reference accepted, terminal outputs match`,
      judged.verdict === 'accepted' && terminalMatches,
      `${judged.passed}/${judged.total}, ${rows.length} terminal rows ${terminalMatches ? 'match' : 'DIFFER'}`
    );
  }
} finally {
  await disconnectDB().catch(() => {});
  await engine.close();
}

console.log(failures === 0 ? '\nall engine integration checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

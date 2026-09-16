import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { compileSource } from './compile.js';
import { outputMatches, COMPARISON } from './compare.js';
import { enqueue } from './queue.js';
import { runOneTest } from './run.js';
import { judgeWithEngine, runInputsOnEngine } from './engine.js';
import { JUDGE_LIMITS, judgeBackend, judgeConcurrency, judgeWorkdir } from './config.js';
import { TEST_STATUS, VERDICT } from '../constants.js';

const classify = (result, expectedOutput, comparison) => {
  if (!result.ok || result.setupFailed) return TEST_STATUS.INTERNAL_ERROR;
  if (result.timedOut) return TEST_STATUS.TIME_LIMIT_EXCEEDED;
  // RLIMIT_CPU fires SIGXCPU then SIGKILL; either way the program burned its
  // budget, which reads as a timeout to the contestant.
  if (result.signal === 'SIGXCPU' || result.signal === 'SIGKILL') {
    return result.outputTruncated ? TEST_STATUS.OUTPUT_LIMIT_EXCEEDED : TEST_STATUS.TIME_LIMIT_EXCEEDED;
  }
  if (result.outputTruncated) return TEST_STATUS.OUTPUT_LIMIT_EXCEEDED;
  if (result.signal || result.exitCode !== 0) return TEST_STATUS.RUNTIME_ERROR;
  return outputMatches(result.stdout, expectedOutput, comparison)
    ? TEST_STATUS.PASSED
    : TEST_STATUS.WRONG_ANSWER;
};

const buildTestPlan = (problem) => [
  ...(problem.samples ?? []).map((sample, i) => ({
    label: `Small test ${i + 1}`,
    visible: true,
    input: sample.input,
    expectedOutput: sample.output,
  })),
  ...(problem.hiddenTests ?? []).map((test, i) => ({
    label: `Large test ${i + 1}`,
    visible: false,
    input: test.input,
    expectedOutput: test.expectedOutput,
  })),
];

const rejectSource = (source) => {
  const reject = (compileOutput) => ({
    verdict: VERDICT.COMPILE_ERROR,
    compileOutput,
    passed: 0,
    total: 0,
    testResults: [],
    durationMs: 0,
  });
  if (typeof source !== 'string' || source.trim().length === 0) return reject('Empty submission.');
  if (Buffer.byteLength(source, 'utf8') > JUDGE_LIMITS.maxSourceBytes) {
    return reject(`Source exceeds ${JUDGE_LIMITS.maxSourceBytes} bytes.`);
  }
  return null;
};

const runJudge = async ({ source, problem }) => {
  const rejected = rejectSource(source);
  if (rejected) return rejected;

  const startedAt = Date.now();
  const root = judgeWorkdir();
  await mkdir(root, { recursive: true });
  const workdir = await mkdtemp(path.join(root, 'sub-'));

  try {
    const compiled = await compileSource({ source, workdir });
    if (!compiled.ok) {
      return {
        verdict: compiled.internal ? VERDICT.INTERNAL_ERROR : VERDICT.COMPILE_ERROR,
        compileOutput: compiled.diagnostics,
        passed: 0,
        total: 0,
        testResults: [],
        durationMs: Date.now() - startedAt,
      };
    }

    const plan = buildTestPlan(problem);
    const timeLimitMs = problem.timeLimitMs ?? JUDGE_LIMITS.run.defaultTimeLimitMs;
    const memoryMb = problem.memoryMb ?? JUDGE_LIMITS.run.defaultMemoryMb;
    const comparison = problem.comparison ?? COMPARISON.TRIMMED;

    const testResults = [];
    let passed = 0;
    let runBudgetMs = JUDGE_LIMITS.run.maxTotalRunMs;

    // Sequential inside one queue slot: the queue already provides parallelism
    // across submissions, and running a contestant's tests in parallel would
    // let one submission hog every core.
    for (const test of plan) {
      if (runBudgetMs <= 0) {
        testResults.push({
          label: test.label,
          visible: test.visible,
          status: TEST_STATUS.SKIPPED,
          timeMs: 0,
        });
        continue;
      }

      const result = await runOneTest({
        binaryPath: compiled.binaryPath,
        input: test.input,
        timeLimitMs,
        memoryMb,
      });
      runBudgetMs -= result.wallMs;
      const status = classify(result, test.expectedOutput, comparison);
      if (status === TEST_STATUS.PASSED) passed += 1;

      testResults.push({
        label: test.label,
        visible: test.visible,
        status,
        timeMs: result.wallMs,
        // Only small cases carry their data back to the client; large tests
        // report nothing but a status, so the contest data never leaks.
        input: test.visible ? test.input : undefined,
        expectedOutput: test.visible ? test.expectedOutput : undefined,
        actualOutput: test.visible ? result.stdout.slice(0, 4000) : undefined,
        stderr: test.visible ? result.stderr.slice(0, 1000) : undefined,
      });
    }

    const total = plan.length;
    const firstFailure = testResults.find((t) => t.status !== TEST_STATUS.PASSED);
    const verdict = !firstFailure
      ? VERDICT.ACCEPTED
      : {
          [TEST_STATUS.WRONG_ANSWER]: VERDICT.WRONG_ANSWER,
          [TEST_STATUS.TIME_LIMIT_EXCEEDED]: VERDICT.TIME_LIMIT_EXCEEDED,
          [TEST_STATUS.RUNTIME_ERROR]: VERDICT.RUNTIME_ERROR,
          [TEST_STATUS.OUTPUT_LIMIT_EXCEEDED]: VERDICT.OUTPUT_LIMIT_EXCEEDED,
          [TEST_STATUS.INTERNAL_ERROR]: VERDICT.INTERNAL_ERROR,
          // Only reachable when the run budget ran out, which in practice means
          // the earlier cases were already crawling.
          [TEST_STATUS.SKIPPED]: VERDICT.TIME_LIMIT_EXCEEDED,
        }[firstFailure.status];

    return {
      verdict,
      compileOutput: compiled.diagnostics,
      passed,
      total,
      testResults,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
};

// A judge-side failure (sandbox or compiler could not start) must not be
// recorded against the contestant: surface it as a retryable 503 instead, the
// same way the engine backend treats an outage.
const unscoredOnJudgeError = (result) => {
  if (result.verdict !== VERDICT.INTERNAL_ERROR) return result;
  const error = new Error('The judge had a problem running your code. It was not scored - please submit again.');
  error.status = 503;
  throw error;
};

export const judgeSubmission = ({ source, problem }) => {
  if (judgeBackend() !== 'engine') return enqueue(() => runJudge({ source, problem })).then(unscoredOnJudgeError);

  const rejected = rejectSource(source);
  if (rejected) return Promise.resolve(rejected);
  // The engine client queues on its own concurrency limit.
  return judgeWithEngine({ source, problem, plan: buildTestPlan(problem) });
};

// Compiles a trusted program (a card's reference) once and collects its output
// for each input. Seeding and the card audit use this, so answer keys and
// terminal outputs come from the same backend that grades submissions.
export const runProgramOnInputs = async ({
  source,
  inputs,
  timeLimitMs = 5000,
  memoryMb = 512,
  onProgress,
}) => {
  if (judgeBackend() === 'engine') {
    return runInputsOnEngine({ source, inputs, timeLimitMs, memoryMb });
  }

  const root = judgeWorkdir();
  await mkdir(root, { recursive: true });
  const workdir = await mkdtemp(path.join(root, 'ref-'));

  try {
    const compiled = await compileSource({ source, workdir });
    if (!compiled.ok) return { ok: false, error: compiled.diagnostics, outputs: [], timings: [] };

    const outputs = new Array(inputs.length);
    const timings = new Array(inputs.length);
    let failure = null;
    let next = 0;
    let done = 0;

    // Admin tooling: runs beside, not through, the contestant queue.
    const worker = async () => {
      while (!failure && next < inputs.length) {
        const index = next++;
        let result = await runOneTest({
          binaryPath: compiled.binaryPath,
          input: inputs[index],
          timeLimitMs,
          memoryMb,
        });
        // Tens of thousands of back-to-back sandboxes (card 10 seeds 26,013)
        // can outrun the kernel's namespace cleanup for longer than
        // execSandbox's own retries cover. This is admin tooling, so wait for
        // the kernel rather than fail: up to a minute per input.
        for (let wait = 0; wait < 12 && result.setupFailed; wait++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          result = await runOneTest({ binaryPath: compiled.binaryPath, input: inputs[index], timeLimitMs, memoryMb });
        }
        if (!result.ok || result.timedOut || result.outputTruncated || result.exitCode !== 0) {
          failure = `reference failed on input ${JSON.stringify(inputs[index])} (exit=${result.exitCode}, timedOut=${result.timedOut}, truncated=${result.outputTruncated}${result.stderr ? `, stderr=${result.stderr.trim().slice(0, 120)}` : ''})`;
          return;
        }
        outputs[index] = result.stdout;
        timings[index] = result.wallMs;
        done += 1;
        if (onProgress && done % 500 === 0) onProgress(done, inputs.length);
      }
    };

    await Promise.all(Array.from({ length: judgeConcurrency() }, worker));
    if (failure) return { ok: false, error: failure, outputs: [], timings: [] };
    return { ok: true, outputs, timings };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
};

export { queueDepth } from './queue.js';

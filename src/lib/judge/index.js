import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execSandbox } from './sandbox.js';
import { compileSource } from './compile.js';
import { outputMatches, COMPARISON } from './compare.js';
import { enqueue } from './queue.js';
import { JUDGE_LIMITS, judgeWorkdir } from './config.js';
import { TEST_STATUS, VERDICT } from '../constants.js';

const runOneTest = async ({ binaryPath, input, timeLimitMs, memoryMb }) => {
  const { run } = JUDGE_LIMITS;

  return execSandbox({
    argv: ['/prog'],
    sandboxArgs: ['--clearenv', '--ro-bind', binaryPath, '/prog', '--chdir', '/'],
    stdin: input ?? '',
    cpuSeconds: Math.ceil(timeLimitMs / 1000) + run.cpuGraceSeconds,
    addressSpaceBytes: memoryMb * 1024 * 1024,
    fileSizeBytes: run.maxOutputBytes,
    wallTimeoutMs: timeLimitMs + run.wallGraceMs,
    maxOutputBytes: run.maxOutputBytes,
  });
};

const classify = (result, expectedOutput, comparison) => {
  if (!result.ok) return TEST_STATUS.INTERNAL_ERROR;
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
    label: `Sample ${i + 1}`,
    visible: true,
    input: sample.input,
    expectedOutput: sample.output,
  })),
  ...(problem.hiddenTests ?? []).map((test, i) => ({
    label: `Hidden ${i + 1}`,
    visible: false,
    input: test.input,
    expectedOutput: test.expectedOutput,
  })),
];

const runJudge = async ({ source, problem }) => {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return {
      verdict: VERDICT.COMPILE_ERROR,
      compileOutput: 'Empty submission.',
      passed: 0,
      total: 0,
      testResults: [],
      durationMs: 0,
    };
  }

  if (Buffer.byteLength(source, 'utf8') > JUDGE_LIMITS.maxSourceBytes) {
    return {
      verdict: VERDICT.COMPILE_ERROR,
      compileOutput: `Source exceeds ${JUDGE_LIMITS.maxSourceBytes} bytes.`,
      passed: 0,
      total: 0,
      testResults: [],
      durationMs: 0,
    };
  }

  const startedAt = Date.now();
  const root = judgeWorkdir();
  await mkdir(root, { recursive: true });
  const workdir = await mkdtemp(path.join(root, 'sub-'));

  try {
    const compiled = await compileSource({ source, workdir });
    if (!compiled.ok) {
      return {
        verdict: VERDICT.COMPILE_ERROR,
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
        // Only sample cases carry their data back to the client; hidden tests
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

export const judgeSubmission = ({ source, problem }) => enqueue(() => runJudge({ source, problem }));

// Compiles a trusted reference solution and collects its output for each input.
// Seeding uses this to derive the answer key by execution instead of by hand,
// so a problem's expected output cannot drift from its reference. Skips the
// queue deliberately: it is admin tooling, not contestant traffic.
export const runProgramOnInputs = async ({
  source,
  inputs,
  timeLimitMs = 5000,
  memoryMb = 512,
}) => {
  const root = judgeWorkdir();
  await mkdir(root, { recursive: true });
  const workdir = await mkdtemp(path.join(root, 'ref-'));

  try {
    const compiled = await compileSource({ source, workdir });
    if (!compiled.ok) return { ok: false, error: compiled.diagnostics, outputs: [] };

    const outputs = [];
    for (const input of inputs) {
      const result = await runOneTest({
        binaryPath: compiled.binaryPath,
        input,
        timeLimitMs,
        memoryMb,
      });

      if (!result.ok || result.timedOut || result.exitCode !== 0) {
        return {
          ok: false,
          error: `reference failed on input ${JSON.stringify(input)} (exit=${result.exitCode}, timedOut=${result.timedOut})`,
          outputs,
        };
      }
      outputs.push(result.stdout);
    }

    return { ok: true, outputs };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
};

export { queueDepth } from './queue.js';

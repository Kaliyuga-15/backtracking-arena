import { runOnEngine } from '../engine/client.js';
import { outputMatches, COMPARISON } from './compare.js';
import { JUDGE_LIMITS } from './config.js';
import { TEST_STATUS, VERDICT } from '../constants.js';

// Engine verdict strings, as listed in the integration guide.
const ENGINE_STATUS = {
  Accepted: TEST_STATUS.PASSED,
  'Wrong Answer': TEST_STATUS.WRONG_ANSWER,
  'Runtime Error': TEST_STATUS.RUNTIME_ERROR,
  'Time Limit Exceeded': TEST_STATUS.TIME_LIMIT_EXCEEDED,
  'Memory Limit Exceeded': TEST_STATUS.MEMORY_LIMIT_EXCEEDED,
  'Output Limit Exceeded': TEST_STATUS.OUTPUT_LIMIT_EXCEEDED,
  'Internal Error': TEST_STATUS.INTERNAL_ERROR,
};

const STATUS_TO_VERDICT = {
  [TEST_STATUS.WRONG_ANSWER]: VERDICT.WRONG_ANSWER,
  [TEST_STATUS.TIME_LIMIT_EXCEEDED]: VERDICT.TIME_LIMIT_EXCEEDED,
  [TEST_STATUS.MEMORY_LIMIT_EXCEEDED]: VERDICT.MEMORY_LIMIT_EXCEEDED,
  [TEST_STATUS.RUNTIME_ERROR]: VERDICT.RUNTIME_ERROR,
  [TEST_STATUS.OUTPUT_LIMIT_EXCEEDED]: VERDICT.OUTPUT_LIMIT_EXCEEDED,
  [TEST_STATUS.INTERNAL_ERROR]: VERDICT.INTERNAL_ERROR,
  [TEST_STATUS.SKIPPED]: VERDICT.INTERNAL_ERROR,
};

const statusFor = (result, expectedOutput, comparison) => {
  if (!result) return TEST_STATUS.SKIPPED;
  const status = ENGINE_STATUS[result.verdict] ?? TEST_STATUS.INTERNAL_ERROR;
  // The engine's own comparison rules are not documented. When it reports a
  // wrong answer, re-check with this platform's rule (trailing whitespace and
  // final newlines ignored) so both backends grade identically.
  if (status === TEST_STATUS.WRONG_ANSWER && typeof result.stdout === 'string') {
    if (outputMatches(result.stdout, expectedOutput, comparison)) return TEST_STATUS.PASSED;
  }
  return status;
};

const compileFailure = (output, startedAt) => ({
  verdict: VERDICT.COMPILE_ERROR,
  compileOutput: output || 'Compilation failed.',
  passed: 0,
  total: 0,
  testResults: [],
  durationMs: Date.now() - startedAt,
});

export const judgeWithEngine = async ({ source, problem, plan }) => {
  const startedAt = Date.now();
  const comparison = problem.comparison ?? COMPARISON.TRIMMED;

  let response;
  try {
    response = await runOnEngine({
      source,
      testcases: plan.map((test) => ({ input: test.input ?? '', output: test.expectedOutput ?? '' })),
      timeLimitMs: problem.timeLimitMs ?? JUDGE_LIMITS.run.defaultTimeLimitMs,
      memoryMb: problem.memoryMb ?? JUDGE_LIMITS.run.defaultMemoryMb,
      stopOnFirstFailure: false,
    });
  } catch (err) {
    // Not recorded as a submission: an engine outage must not cost the
    // contestant an attempt or a zero on the leaderboard.
    console.error('[judge engine]', err.message);
    const unavailable = new Error('The code execution engine is busy or unavailable. Your code was not scored - please submit again in a moment.');
    unavailable.status = 503;
    throw unavailable;
  }

  if (response?.compile && response.compile.ok === false) {
    return compileFailure(response.compile.output, startedAt);
  }
  if (response?.summary?.verdict === 'Compilation Error') {
    return compileFailure(response.compile?.output, startedAt);
  }

  const byIndex = new Map((response?.results ?? []).map((result) => [result.index, result]));
  let passed = 0;

  const testResults = plan.map((test, index) => {
    const result = byIndex.get(index);
    const status = statusFor(result, test.expectedOutput, comparison);
    if (status === TEST_STATUS.PASSED) passed += 1;

    return {
      label: test.label,
      visible: test.visible,
      status,
      timeMs: result?.time_ms ?? 0,
      input: test.visible ? test.input : undefined,
      expectedOutput: test.visible ? test.expectedOutput : undefined,
      actualOutput: test.visible ? String(result?.stdout ?? '').slice(0, 4000) : undefined,
      stderr: test.visible ? String(result?.stderr ?? '').slice(0, 1000) : undefined,
    };
  });

  const firstFailure = testResults.find((test) => test.status !== TEST_STATUS.PASSED);

  return {
    verdict: firstFailure ? STATUS_TO_VERDICT[firstFailure.status] : VERDICT.ACCEPTED,
    compileOutput: response?.compile?.output ?? '',
    passed,
    total: plan.length,
    testResults,
    durationMs: Date.now() - startedAt,
  };
};

// Runs a trusted program (a card's reference) and returns its raw stdout per
// input. Expected outputs are blank, so the engine reports "Wrong Answer" for
// any non-empty output; only non-comparison verdicts count as failures.
export const runInputsOnEngine = async ({ source, inputs, timeLimitMs, memoryMb, batchSize = 400 }) => {
  const outputs = [];
  const timings = [];

  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const batch = inputs.slice(offset, offset + batchSize);
    const response = await runOnEngine({
      source,
      testcases: batch.map((input) => ({ input, output: '' })),
      timeLimitMs,
      memoryMb,
    });

    if (response?.compile?.ok === false) {
      return { ok: false, error: `does not compile on the engine: ${response.compile.output}`, outputs, timings };
    }

    const byIndex = new Map((response?.results ?? []).map((result) => [result.index, result]));
    for (const [index, input] of batch.entries()) {
      const result = byIndex.get(index);
      if (!result || !['Accepted', 'Wrong Answer'].includes(result.verdict)) {
        return {
          ok: false,
          error: `engine verdict "${result?.verdict ?? 'missing'}" on input ${JSON.stringify(input)}`,
          outputs,
          timings,
        };
      }
      outputs.push(String(result.stdout ?? ''));
      timings.push(result.time_ms ?? 0);
    }
  }

  return { ok: true, outputs, timings };
};

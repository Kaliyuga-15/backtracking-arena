// Every limit the judge enforces lives here so a contest admin can retune the
// box without hunting through the runner code.

export const JUDGE_LIMITS = {
  maxSourceBytes: 64 * 1024,
  maxOpenFiles: 64,

  compile: {
    cpuSeconds: 10,
    addressSpaceBytes: 1024 * 1024 * 1024,
    fileSizeBytes: 32 * 1024 * 1024,
    wallTimeoutMs: 15000,
    maxOutputBytes: 64 * 1024,
  },

  run: {
    // Per-test defaults; a problem may override timeLimitMs / memoryMb.
    defaultTimeLimitMs: 2000,
    defaultMemoryMb: 256,
    maxOutputBytes: 1024 * 1024,
    // RLIMIT_CPU is whole seconds, so a 2000ms limit becomes 3s of CPU. The
    // wall-clock timer is the real deadline; this only stops spin loops that
    // survive it.
    cpuGraceSeconds: 1,
    wallGraceMs: 1000,
    // Ceiling on the whole submission, not one test. A program that times out
    // on every case would otherwise pin a worker for testCount * timeLimit --
    // 8 tests at 2s is 24s of one core for a submission already destined to
    // fail. Remaining cases are reported as skipped once this is spent.
    maxTotalRunMs: 12000,
  },
};

export const GCC = 'gcc';

// -w keeps warning spam out of the compile log the contestant sees; real errors
// still come through. -fno-asm is deliberately NOT set: the sandbox is the
// security boundary, not the compiler flags.
export const GCC_FLAGS = ['-O2', '-std=c11', '-w'];
export const GCC_LINK_FLAGS = ['-lm'];

export const judgeConcurrency = () => {
  const parsed = Number.parseInt(process.env.JUDGE_CONCURRENCY ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 3;
};

export const judgeWorkdir = () => process.env.JUDGE_WORKDIR || '/tmp/arena-judge';

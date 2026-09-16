import { execSandbox } from './sandbox.js';
import { JUDGE_LIMITS } from './config.js';

export const runOneTest = ({
  binaryPath,
  input,
  timeLimitMs,
  memoryMb,
  maxOutputBytes = JUDGE_LIMITS.run.maxOutputBytes,
}) => {
  const { run } = JUDGE_LIMITS;

  return execSandbox({
    argv: ['/prog'],
    sandboxArgs: ['--clearenv', '--ro-bind', binaryPath, '/prog', '--chdir', '/'],
    stdin: input ?? '',
    cpuSeconds: Math.ceil(timeLimitMs / 1000) + run.cpuGraceSeconds,
    addressSpaceBytes: memoryMb * 1024 * 1024,
    fileSizeBytes: maxOutputBytes,
    wallTimeoutMs: timeLimitMs + run.wallGraceMs,
    maxOutputBytes,
  });
};

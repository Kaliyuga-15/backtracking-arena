import { spawn } from 'node:child_process';
import { JUDGE_LIMITS } from './config.js';

// Untrusted C runs under bubblewrap rather than Docker: namespace setup costs
// ~5ms instead of ~300ms, which is what makes ~100 concurrent contestants
// affordable on a small box. Swapping in a Docker backend means reimplementing
// execSandbox alone -- nothing above this file knows how isolation happens.
//
// Layers, outermost first:
//   prlimit  RLIMIT_CPU / AS / FSIZE / NOFILE, inherited across exec
//   bwrap    no network, private PID+IPC+UTS ns, read-only /usr, tmpfs /tmp
//   node     wall-clock kill and an output-size cap
//
// RLIMIT_NPROC is deliberately absent: it is per-UID, not per-sandbox, so
// setting it below the account's live process count makes clone() fail with
// EAGAIN and every judge run dies. Fork bombs are contained by the CPU limit
// and the wall-clock kill instead.
const baseSandboxArgs = () => [
  '--unshare-all',
  '--die-with-parent',
  '--new-session',
  '--ro-bind', '/usr', '/usr',
  '--symlink', 'usr/bin', '/bin',
  '--symlink', 'usr/sbin', '/sbin',
  '--symlink', 'usr/lib', '/lib',
  '--proc', '/proc',
  '--dev', '/dev',
  '--tmpfs', '/tmp',
];

const killTree = (child) => {
  try {
    // detached:true made the child a group leader, so the negative pid takes
    // the whole group with it.
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
};

const execOnce = ({
  argv,
  sandboxArgs = [],
  stdin = '',
  cpuSeconds,
  addressSpaceBytes,
  fileSizeBytes,
  wallTimeoutMs,
  maxOutputBytes,
}) =>
  new Promise((resolve) => {
    const args = [
      `--cpu=${cpuSeconds}`,
      `--as=${addressSpaceBytes}`,
      `--fsize=${fileSizeBytes}`,
      `--nofile=${JUDGE_LIMITS.maxOpenFiles}`,
      '--',
      'bwrap',
      ...baseSandboxArgs(),
      ...sandboxArgs,
      ...argv,
    ];

    const startedAt = process.hrtime.bigint();
    let child;
    try {
      child = spawn('prlimit', args, { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({
        ok: false,
        spawnError: err.message,
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        timedOut: false,
        outputTruncated: false,
        wallMs: 0,
      });
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, wallTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        if (!outputTruncated) {
          outputTruncated = true;
          killTree(child);
        }
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      // stderr only ever reaches a human, so cap it hard and keep the head.
      if (stderrBytes > JUDGE_LIMITS.compile.maxOutputBytes) return;
      stderrChunks.push(chunk);
    });

    // A program that exits without draining stdin gives us EPIPE; that is a
    // normal outcome, not a judge failure.
    child.stdin.on('error', () => {});
    try {
      child.stdin.end(stdin);
    } catch {
      // Same story if the pipe closed before we got here.
    }

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve({
        ok: true,
        spawnError: null,
        // bwrap itself could not build the sandbox; the program never ran.
        setupFailed: exitCode === 1 && stdout === '' && /^bwrap: /.test(stderr),
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut,
        outputTruncated,
        wallMs: Number((process.hrtime.bigint() - startedAt) / 1000000n),
      });
    };

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        spawnError: err.message,
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        timedOut,
        outputTruncated,
        wallMs: Number((process.hrtime.bigint() - startedAt) / 1000000n),
      });
    });

    // 'close' rather than 'exit': it waits for the stdio pipes to drain.
    child.on('close', (code, signal) => finish(code, signal));
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SETUP_RETRY_DELAYS_MS = [50, 250, 1000, 3000];

// The kernel frees network namespaces lazily, so a burst of sandboxes can hit
// the per-user namespace limit ("Creating new namespace failed: No space left
// on device"). That is a judge-side failure, not the program's: wait for the
// kernel to catch up and try again. A result that still has setupFailed set is
// reported as a judge error by callers, never as the contestant's runtime error.
export const execSandbox = async (options) => {
  let result = await execOnce(options);
  for (const delay of SETUP_RETRY_DELAYS_MS) {
    if (!result.setupFailed) break;
    await sleep(delay);
    result = await execOnce(options);
  }
  return result;
};

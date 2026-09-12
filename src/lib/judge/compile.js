import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { execSandbox } from './sandbox.js';
import { GCC, GCC_FLAGS, GCC_LINK_FLAGS, JUDGE_LIMITS } from './config.js';

// The sandbox mounts the work directory at a fixed path, so gcc diagnostics
// would otherwise hand the contestant our internal layout.
const tidyDiagnostics = (text) => text.split('/work/').join('').trim();

export const compileSource = async ({ source, workdir }) => {
  const sourcePath = path.join(workdir, 'main.c');
  await writeFile(sourcePath, source, 'utf8');

  const { compile } = JUDGE_LIMITS;
  const result = await execSandbox({
    argv: [GCC, ...GCC_FLAGS, '-o', 'prog', 'main.c', ...GCC_LINK_FLAGS],
    sandboxArgs: [
      '--clearenv',
      '--setenv', 'PATH', '/usr/bin:/bin',
      '--bind', workdir, '/work',
      '--chdir', '/work',
    ],
    cpuSeconds: compile.cpuSeconds,
    addressSpaceBytes: compile.addressSpaceBytes,
    fileSizeBytes: compile.fileSizeBytes,
    wallTimeoutMs: compile.wallTimeoutMs,
    maxOutputBytes: compile.maxOutputBytes,
  });

  if (!result.ok) {
    return { ok: false, diagnostics: `Judge could not start the compiler: ${result.spawnError}` };
  }

  if (result.timedOut) {
    return { ok: false, diagnostics: 'Compilation timed out.' };
  }

  if (result.exitCode !== 0) {
    const diagnostics = tidyDiagnostics(`${result.stderr}\n${result.stdout}`);
    return { ok: false, diagnostics: diagnostics || 'Compilation failed.' };
  }

  return {
    ok: true,
    diagnostics: tidyDiagnostics(result.stderr),
    binaryPath: path.join(workdir, 'prog'),
  };
};

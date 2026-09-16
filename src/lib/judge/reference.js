import { runProgramOnInputs } from './index.js';
import { JUDGE_LIMITS } from './config.js';
import { referenceHash } from './hash.js';

export { referenceHash };

// Live fallback for a terminal input with no precomputed row (a card edited
// through the API without re-seeding). Outputs are cached in memory because the
// reference is deterministic.
const cache = globalThis.__arenaReferenceCache ?? new Map();
globalThis.__arenaReferenceCache = cache;

export const runReference = async ({ source, input }) => {
  const key = `${referenceHash(source)}:${input}`;
  if (cache.has(key)) return cache.get(key);

  const { terminal } = JUDGE_LIMITS;
  const result = await runProgramOnInputs({
    source,
    inputs: [`${input}\n`],
    timeLimitMs: terminal.timeLimitMs,
    memoryMb: terminal.memoryMb,
  });
  if (!result.ok) throw new Error(`Reference run failed: ${result.error}`);

  const output = result.outputs[0];
  cache.set(key, output);
  if (cache.size > terminal.cachedOutputs) cache.delete(cache.keys().next().value);
  return output;
};

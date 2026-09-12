import { judgeConcurrency } from './config.js';

// One process-wide queue keeps compile+run work at roughly core count no matter
// how many contestants press submit at once. Without it, 100 simultaneous
// submissions would fork 100 gcc processes and the box would thrash.
const state = globalThis.__arenaJudgeQueue ?? {
  active: 0,
  pending: [],
};
globalThis.__arenaJudgeQueue = state;

const pump = () => {
  const limit = judgeConcurrency();
  while (state.active < limit && state.pending.length > 0) {
    const job = state.pending.shift();
    state.active += 1;
    job
      .task()
      .then(job.resolve, job.reject)
      .finally(() => {
        state.active -= 1;
        pump();
      });
  }
};

export const enqueue = (task) =>
  new Promise((resolve, reject) => {
    state.pending.push({ task, resolve, reject });
    pump();
  });

export const queueDepth = () => ({ active: state.active, waiting: state.pending.length });

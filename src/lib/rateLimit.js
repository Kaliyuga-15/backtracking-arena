// Submission throttling. In-process state is correct for the single-instance
// deployment this targets; running two instances means moving this to Redis,
// the same caveat Quiz Mania's socket state carries.
const state = globalThis.__arenaRateLimit ?? { lastSubmit: new Map(), inFlight: new Set() };
globalThis.__arenaRateLimit = state;

const cooldownMs = () => {
  const parsed = Number.parseInt(process.env.JUDGE_SUBMIT_COOLDOWN_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
};

// One judge run per contestant at a time, plus a cooldown between runs. Without
// this, a single tab hammering submit can starve the queue for everyone else.
export const claimSubmitSlot = (userId) => {
  if (state.inFlight.has(userId)) {
    return { allowed: false, message: 'Your previous submission is still being judged.' };
  }

  const last = state.lastSubmit.get(userId) ?? 0;
  const waitMs = last + cooldownMs() - Date.now();
  if (waitMs > 0) {
    return {
      allowed: false,
      message: `Please wait ${Math.ceil(waitMs / 1000)}s before submitting again.`,
    };
  }

  state.inFlight.add(userId);
  return { allowed: true };
};

export const releaseSubmitSlot = (userId, { startCooldown = true } = {}) => {
  state.inFlight.delete(userId);
  if (startCooldown) state.lastSubmit.set(userId, Date.now());
};

// Terminal runs are unlimited in number, but one contestant gets one run at a
// time so a held-down Enter key cannot flood the judge queue.
const terminalInFlight = globalThis.__arenaTerminalInFlight ?? new Set();
globalThis.__arenaTerminalInFlight = terminalInFlight;

export const claimTerminalSlot = (userId) => {
  if (terminalInFlight.has(userId)) return false;
  terminalInFlight.add(userId);
  return true;
};

export const releaseTerminalSlot = (userId) => {
  terminalInFlight.delete(userId);
};

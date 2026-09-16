import { connectDB } from '@/lib/db';
import { Problem } from '@/models/Problem';
import { Contest } from '@/models/Contest';
import { TerminalOutput } from '@/models/TerminalOutput';
import { ok, fail, withErrors, DEFAULT_CONTEST_KEY } from '@/lib/api';
import { requireIdentity } from '@/lib/auth';
import { claimTerminalSlot, releaseTerminalSlot } from '@/lib/rateLimit';
import { parseTerminalInput } from '@/lib/playground';
import { referenceHash, runReference } from '@/lib/judge/reference';
import { CONTEST_STATUS, PROBLEM_STATUS } from '@/lib/constants';
import { JUDGE_LIMITS } from '@/lib/judge/config';

export const dynamic = 'force-dynamic';

// Returns the hidden reference program's output for one contestant-chosen
// input. Inputs are confined to the card's terminal range, and every large
// judge test sits outside it, so outputs gathered here cannot be replayed.
export const POST = withErrors(async (request, { params }) => {
  const identity = requireIdentity(request);
  await connectDB();

  const { slug } = await params;
  const body = await request.json().catch(() => ({}));

  const problem = await Problem.findOne({ slug }).select('+referenceSolution');
  if (!problem || (problem.status !== PROBLEM_STATUS.PUBLISHED && !identity.isAdmin)) {
    return fail('Problem not found', 404);
  }

  const contest = await Contest.findOne({ key: body.contestKey ?? DEFAULT_CONTEST_KEY });
  const opened = contest && contest.status !== CONTEST_STATUS.SCHEDULED;
  if (!opened && !identity.isAdmin) {
    return fail('The terminal opens when the contest starts.', 409);
  }

  const parsed = parseTerminalInput(body.input, problem.terminalFields, JUDGE_LIMITS.terminal.maxInputChars);
  if (!parsed.ok) return fail(parsed.message, 422);

  const hash = referenceHash(problem.referenceSolution);
  const stored = await TerminalOutput.findOne({ slug, input: parsed.normalized }).lean();
  if (stored && stored.referenceHash === hash) {
    return ok({ input: parsed.normalized, output: stored.output });
  }

  if (!claimTerminalSlot(identity.userId)) {
    return fail('Still running your previous input.', 429);
  }

  try {
    const output = await runReference({ source: problem.referenceSolution, input: parsed.normalized });
    await TerminalOutput.updateOne(
      { slug, input: parsed.normalized },
      { $set: { output, referenceHash: hash } },
      { upsert: true }
    );
    return ok({ input: parsed.normalized, output });
  } catch (err) {
    console.error('[terminal]', err.message);
    return fail('The terminal is temporarily unavailable. Try again in a moment.', 503);
  } finally {
    releaseTerminalSlot(identity.userId);
  }
});

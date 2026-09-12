import { connectDB } from '@/lib/db';
import { Problem } from '@/models/Problem';
import { Submission } from '@/models/Submission';
import { Contest } from '@/models/Contest';
import { ok, fail, withErrors, DEFAULT_CONTEST_KEY } from '@/lib/api';
import { requireIdentity } from '@/lib/auth';
import { claimSubmitSlot, releaseSubmitSlot } from '@/lib/rateLimit';
import { judgeSubmission } from '@/lib/judge';
import { scoreFor } from '@/lib/scoring';
import { broadcastLeaderboard } from '@/lib/realtime';
import { PROBLEM_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async (request) => {
  const identity = requireIdentity(request);
  await connectDB();

  const contestKey = request.nextUrl.searchParams.get('key') ?? DEFAULT_CONTEST_KEY;
  const problemSlug = request.nextUrl.searchParams.get('problemSlug');

  const filter = { contestKey, userId: identity.userId };
  if (problemSlug) filter.problemSlug = problemSlug;

  // `source` is omitted: the list view only needs verdicts, and it keeps the
  // payload small when someone has fifty attempts.
  const submissions = await Submission.find(filter)
    .select('-source')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return ok(submissions);
});

export const POST = withErrors(async (request) => {
  const identity = requireIdentity(request);
  await connectDB();

  const body = await request.json();
  const contestKey = body.contestKey ?? DEFAULT_CONTEST_KEY;
  const { problemSlug, source } = body;

  if (!problemSlug) return fail('problemSlug is required');
  if (typeof source !== 'string' || source.trim().length === 0) {
    return fail('Write some code before submitting.');
  }

  const contest = await Contest.findOne({ key: contestKey });
  if (!contest) return fail('Contest not found', 404);

  // Admins can submit outside the window so a problem can be verified against
  // the real judge before the contest opens.
  if (!contest.isAcceptingSubmissions() && !identity.isAdmin) {
    return fail('The contest is not accepting submissions right now.', 409);
  }

  const problem = await Problem.findOne({ slug: problemSlug }).select('+hiddenTests');
  if (!problem) return fail('Problem not found', 404);
  if (problem.status !== PROBLEM_STATUS.PUBLISHED && !identity.isAdmin) {
    return fail('Problem not found', 404);
  }

  const slot = claimSubmitSlot(identity.userId);
  if (!slot.allowed) return fail(slot.message, 429);

  let judged;
  try {
    judged = await judgeSubmission({
      source,
      problem: {
        samples: problem.samples,
        hiddenTests: problem.hiddenTests,
        timeLimitMs: problem.timeLimitMs,
        memoryMb: problem.memoryMb,
        comparison: problem.comparison,
      },
    });
  } finally {
    releaseSubmitSlot(identity.userId);
  }

  const score = scoreFor({
    points: problem.points,
    passed: judged.passed,
    total: judged.total,
  });

  const submission = await Submission.create({
    contestKey,
    problemSlug,
    userId: identity.userId,
    userName: identity.name,
    language: 'c',
    source,
    verdict: judged.verdict,
    passed: judged.passed,
    total: judged.total,
    score,
    compileOutput: judged.compileOutput,
    testResults: judged.testResults,
    durationMs: judged.durationMs,
  });

  broadcastLeaderboard(contestKey);

  const result = submission.toObject();
  delete result.source;
  return ok(result, 201);
});

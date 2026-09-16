import { connectDB } from '@/lib/db';
import { Problem } from '@/models/Problem';
import { ok, fail, withErrors } from '@/lib/api';
import { getIdentity, requireAdmin } from '@/lib/auth';
import { PROBLEM_STATUS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async (request, { params }) => {
  await connectDB();
  const { slug } = await params;

  const problem = await Problem.findOne({ slug }).lean();
  if (!problem) return fail('Problem not found', 404);

  // Draft and archived cards stay invisible to contestants.
  if (problem.status !== PROBLEM_STATUS.PUBLISHED) requireAdmin(request);

  const identity = getIdentity(request);
  if (!identity?.isAdmin) delete problem.samples;

  return ok(problem);
});

const EDITABLE_FIELDS = [
  'title',
  'order',
  'difficulty',
  'statement',
  'inputFormat',
  'judgeFields',
  'terminalFields',
  'hint',
  'starterCode',
  'samples',
  'hiddenTests',
  'referenceSolution',
  'points',
  'timeLimitMs',
  'memoryMb',
  'comparison',
  'status',
];

export const PATCH = withErrors(async (request, { params }) => {
  requireAdmin(request);
  await connectDB();

  const { slug } = await params;
  const body = await request.json();

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  const problem = await Problem.findOneAndUpdate({ slug }, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!problem) return fail('Problem not found', 404);
  return ok(problem);
});

export const DELETE = withErrors(async (request, { params }) => {
  requireAdmin(request);
  await connectDB();

  const { slug } = await params;

  // Archive rather than drop: existing submissions still reference the slug and
  // the leaderboard is derived from them.
  const problem = await Problem.findOneAndUpdate(
    { slug },
    { status: PROBLEM_STATUS.ARCHIVED },
    { new: true }
  ).lean();

  if (!problem) return fail('Problem not found', 404);
  return ok(problem);
});

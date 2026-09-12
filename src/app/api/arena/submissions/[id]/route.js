import { connectDB } from '@/lib/db';
import { Submission } from '@/models/Submission';
import { ok, fail, withErrors } from '@/lib/api';
import { requireIdentity } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async (request, { params }) => {
  const identity = requireIdentity(request);
  await connectDB();

  const { id } = await params;
  const submission = await Submission.findById(id).lean();
  if (!submission) return fail('Submission not found', 404);

  // Contestants read their own work only; admins can open any of it to review a
  // dispute.
  if (submission.userId !== identity.userId && !identity.isAdmin) {
    return fail('Submission not found', 404);
  }

  return ok(submission);
});

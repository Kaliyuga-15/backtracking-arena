import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { Problem } from '@/models/Problem';
import { PROBLEM_STATUS } from '@/lib/constants';
import { DEFAULT_CONTEST_KEY } from '@/lib/api';
import ProblemWorkspace from '@/components/ProblemWorkspace';

export const dynamic = 'force-dynamic';

export default async function ProblemPage({ params }) {
  const { slug } = await params;
  await connectDB();

  const problem = await Problem.findOne({ slug, status: PROBLEM_STATUS.PUBLISHED })
    .select('slug title order statement hint starterCode samples points timeLimitMs memoryMb')
    .lean();

  if (!problem) notFound();

  return (
    <ProblemWorkspace
      contestKey={DEFAULT_CONTEST_KEY}
      problem={{ ...problem, _id: String(problem._id) }}
    />
  );
}

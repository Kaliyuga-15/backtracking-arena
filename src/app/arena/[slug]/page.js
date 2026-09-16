import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { Problem } from '@/models/Problem';
import { PROBLEM_STATUS } from '@/lib/constants';
import { DEFAULT_CONTEST_KEY } from '@/lib/api';
import ProblemWorkspace from '@/components/ProblemWorkspace';
import { referenceHash } from '@/lib/judge/hash';

export const dynamic = 'force-dynamic';

export default async function ProblemPage({ params }) {
  const { slug } = await params;
  await connectDB();

  const problem = await Problem.findOne({ slug, status: PROBLEM_STATUS.PUBLISHED })
    .select(
      'slug title order difficulty statement inputFormat judgeFields terminalFields hint starterCode points timeLimitMs memoryMb +referenceSolution'
    )
    .lean();

  if (!problem) notFound();

  // Saved terminal history is keyed by this, so a changed program or range starts
  // a fresh scrollback instead of showing outputs from the old card.
  const { referenceSolution, ...card } = problem;
  const terminalVersion = referenceHash(`${referenceSolution}|${JSON.stringify(card.terminalFields)}`);

  return (
    <ProblemWorkspace
      contestKey={DEFAULT_CONTEST_KEY}
      problem={{ ...card, _id: String(card._id), terminalVersion }}
    />
  );
}

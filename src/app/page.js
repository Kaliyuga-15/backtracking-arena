import { connectDB } from '@/lib/db';
import { Problem } from '@/models/Problem';
import { LEVELS, PROBLEM_STATUS } from '@/lib/constants';
import { DEFAULT_CONTEST_KEY } from '@/lib/api';
import ArenaHome from '@/components/ArenaHome';

export const dynamic = 'force-dynamic';

const getProblems = async () => {
  await connectDB();
  // hiddenTests and referenceSolution are select:false, so nothing secret can
  // ride along into the client component below.
  return Problem.find({ level: LEVELS.BACKTRACKING, status: PROBLEM_STATUS.PUBLISHED })
    .select('slug title order points timeLimitMs statement')
    .sort({ order: 1 })
    .lean();
};

export default async function HomePage() {
  const problems = await getProblems();

  return (
    <ArenaHome
      contestKey={DEFAULT_CONTEST_KEY}
      problems={problems.map((problem) => ({ ...problem, _id: String(problem._id) }))}
    />
  );
}

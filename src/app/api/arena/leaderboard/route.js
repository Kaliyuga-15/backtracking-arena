import { connectDB } from '@/lib/db';
import { ok, withErrors, DEFAULT_CONTEST_KEY } from '@/lib/api';
import { leaderboardFor } from '@/lib/leaderboardService';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async (request) => {
  await connectDB();
  const key = request.nextUrl.searchParams.get('key') ?? DEFAULT_CONTEST_KEY;
  return ok(await leaderboardFor(key));
});

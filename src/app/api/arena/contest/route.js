import { connectDB } from '@/lib/db';
import { Contest } from '@/models/Contest';
import { ok, fail, withErrors, DEFAULT_CONTEST_KEY } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { CONTEST_STATUS, LEVELS } from '@/lib/constants';
import { broadcastContestState } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

const loadOrCreate = async (key) => {
  const existing = await Contest.findOne({ key });
  if (existing) return existing;

  return Contest.create({
    key,
    title: 'Level 2 - Backtracking',
    level: LEVELS.BACKTRACKING,
    status: CONTEST_STATUS.SCHEDULED,
  });
};

export const GET = withErrors(async (request) => {
  await connectDB();
  const key = request.nextUrl.searchParams.get('key') ?? DEFAULT_CONTEST_KEY;
  const contest = await loadOrCreate(key);
  return ok(contest.toStatePayload());
});

// Admin controls: start / end / extend the window.
export const PATCH = withErrors(async (request) => {
  requireAdmin(request);
  await connectDB();

  const body = await request.json();
  const key = body.key ?? DEFAULT_CONTEST_KEY;
  const contest = await loadOrCreate(key);

  if (body.title) contest.title = body.title;
  if (typeof body.freezeSubmissions === 'boolean') {
    contest.freezeSubmissions = body.freezeSubmissions;
  }
  if (typeof body.durationMinutes === 'number') {
    contest.durationMinutes = body.durationMinutes;
  }

  switch (body.action) {
    case 'start': {
      const startsAt = new Date();
      contest.status = CONTEST_STATUS.RUNNING;
      contest.startsAt = startsAt;
      contest.endsAt = new Date(startsAt.getTime() + contest.durationMinutes * 60000);
      contest.freezeSubmissions = false;
      break;
    }
    case 'end':
      contest.status = CONTEST_STATUS.ENDED;
      contest.endsAt = new Date();
      break;
    case 'reset':
      contest.status = CONTEST_STATUS.SCHEDULED;
      contest.startsAt = null;
      contest.endsAt = null;
      break;
    case 'extend': {
      const extraMinutes = Number(body.minutes);
      if (!Number.isFinite(extraMinutes) || extraMinutes === 0) {
        return fail('extend needs a non-zero "minutes"');
      }
      const base = contest.endsAt ?? new Date();
      contest.endsAt = new Date(base.getTime() + extraMinutes * 60000);
      break;
    }
    case undefined:
      break;
    default:
      return fail(`Unknown action "${body.action}"`);
  }

  await contest.save();
  broadcastContestState(contest);

  return ok(contest.toStatePayload());
});

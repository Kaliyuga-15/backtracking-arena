import { Submission } from '../models/Submission.js';
import { buildLeaderboard } from './scoring.js';

// Recomputed from submissions rather than kept as a running tally: at ~100
// contestants the read is a few thousand small documents, and deriving it means
// a rejudge or a deleted problem can never leave a stale standing behind.
export const leaderboardFor = async (contestKey) => {
  const submissions = await Submission.find({ contestKey })
    .select('userId userName problemSlug score verdict createdAt')
    .lean();

  return buildLeaderboard(submissions);
};

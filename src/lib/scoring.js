// Partial credit: every hidden test carries an equal slice of the problem's
// points, and a full pass always awards exactly `points` (never a rounding
// artifact).
export const scoreFor = ({ points, passed, total }) => {
  if (!total || total <= 0) return 0;
  if (passed >= total) return points;
  if (passed <= 0) return 0;
  return Math.round((points * passed) / total);
};

// A contestant's result for one problem is their single best submission; ties
// on score resolve to whichever reached it first.
const isBetter = (candidate, current) => {
  if (!current) return true;
  if (candidate.score !== current.score) return candidate.score > current.score;
  return new Date(candidate.createdAt) < new Date(current.createdAt);
};

export const buildLeaderboard = (submissions) => {
  const byUser = new Map();

  for (const submission of submissions) {
    const entry = byUser.get(submission.userId) ?? {
      userId: submission.userId,
      name: submission.userName,
      best: new Map(),
      attempts: 0,
    };

    entry.attempts += 1;
    entry.name = submission.userName || entry.name;

    const current = entry.best.get(submission.problemSlug);
    if (isBetter(submission, current)) {
      entry.best.set(submission.problemSlug, {
        score: submission.score,
        createdAt: submission.createdAt,
        verdict: submission.verdict,
      });
    }

    byUser.set(submission.userId, entry);
  }

  const rows = [...byUser.values()].map((entry) => {
    const bests = [...entry.best.entries()];
    const totalScore = bests.reduce((sum, [, best]) => sum + best.score, 0);
    const solved = bests.filter(([, best]) => best.verdict === 'accepted').length;

    // The moment their current total was locked in. Earlier is better, so a
    // contestant who reached the same score sooner outranks a later one.
    const settledAt = bests.reduce((latest, [, best]) => {
      const at = new Date(best.createdAt).getTime();
      return at > latest ? at : latest;
    }, 0);

    return {
      userId: entry.userId,
      name: entry.name,
      totalScore,
      solved,
      attempts: entry.attempts,
      settledAt,
      perProblem: Object.fromEntries(bests.map(([slug, best]) => [slug, best.score])),
    };
  });

  rows.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.settledAt - b.settledAt;
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
};

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useArena } from '@/hooks/useArena';
import { currentUser } from '@/lib/identity';
import { apiFetch } from '@/lib/apiClient';
import { CONTEST_STATUS } from '@/lib/constants';
import ContestTimer from './ContestTimer';
import ArenaLeaderboard from './ArenaLeaderboard';

export default function ArenaHome({ contestKey, problems }) {
  const { contest, leaderboard, error } = useArena(contestKey);
  const [signedIn, setSignedIn] = useState(false);
  const [mySubmissions, setMySubmissions] = useState([]);

  useEffect(() => {
    setSignedIn(Boolean(currentUser()));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    apiFetch(`/api/arena/submissions?key=${encodeURIComponent(contestKey)}`)
      .then(setMySubmissions)
      .catch(() => setMySubmissions([]));
  }, [signedIn, contestKey, leaderboard]);

  // Best score per problem, so each card can show progress at a glance.
  const bestByProblem = mySubmissions.reduce((acc, submission) => {
    const current = acc[submission.problemSlug];
    if (!current || submission.score > current.score) acc[submission.problemSlug] = submission;
    return acc;
  }, {});

  const notStarted = contest?.status === CONTEST_STATUS.SCHEDULED;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-indigo-300/70">Level 2</p>
          <h1 className="mt-1 text-3xl font-bold">{contest?.title ?? 'Backtracking'}</h1>
          <p className="mt-2 max-w-2xl text-white/60">
            Each card shows only inputs and the outputs they produce. Work out the rule, write the C
            program that reproduces it, and submit.
          </p>
        </div>
        <ContestTimer contest={contest} />
      </section>

      {error ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </p>
      ) : null}

      {!signedIn ? (
        <p className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
          Enter your name in the top right to start.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Problems</h2>

        {problems.length === 0 ? (
          <p className="text-white/50">
            No published problems. Run <code className="text-indigo-300">npm run seed:problems</code>.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {problems.map((problem) => {
              const best = bestByProblem[problem.slug];
              const solved = best?.score >= problem.points;

              return (
                <li key={problem.slug}>
                  <Link
                    href={`/arena/${problem.slug}`}
                    className={`block h-full rounded-xl border p-4 transition ${
                      solved
                        ? 'border-emerald-400/30 bg-emerald-500/[0.07] hover:border-emerald-400/60'
                        : 'border-white/10 bg-white/5 hover:border-indigo-400/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{problem.title}</span>
                      <span className="mono shrink-0 text-xs tabular-nums text-white/40">
                        {problem.points} pts
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs">
                      {best ? (
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            solved
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : 'bg-amber-500/15 text-amber-200'
                          }`}
                        >
                          {solved ? 'Solved' : `${best.passed}/${best.total} tests`}
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">
                          Not attempted
                        </span>
                      )}
                      <span
                        className={
                          problem.difficulty === 'hard' ? 'text-red-300/70' : 'text-amber-300/70'
                        }
                      >
                        {problem.difficulty === 'hard' ? 'Hard' : 'Medium'}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Standings</h2>
          {notStarted ? <span className="text-xs text-white/40">Contest not started</span> : null}
        </div>
        <ArenaLeaderboard rows={leaderboard} problems={problems} />
      </section>
    </div>
  );
}

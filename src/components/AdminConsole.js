'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useArena } from '@/hooks/useArena';
import { CONTEST_STATUS } from '@/lib/constants';
import ContestTimer from './ContestTimer';
import ArenaLeaderboard from './ArenaLeaderboard';

export default function AdminConsole({ contestKey }) {
  const { contest: liveContest, leaderboard } = useArena(contestKey);
  const [contest, setContest] = useState(null);
  const [problems, setProblems] = useState([]);
  const [duration, setDuration] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (liveContest) setContest(liveContest);
  }, [liveContest]);

  useEffect(() => {
    apiFetch(`/api/arena/contest?key=${encodeURIComponent(contestKey)}`)
      .then((data) => {
        setContest(data);
        setDuration(data.durationMinutes);
      })
      .catch((err) => setError(err.message));

    apiFetch('/api/arena/problems')
      .then(setProblems)
      .catch(() => {});
  }, [contestKey]);

  const act = async (body) => {
    setBusy(true);
    setError(null);
    try {
      setContest(await apiFetch('/api/arena/contest', { method: 'PATCH', body: { key: contestKey, ...body } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const status = contest?.status;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-indigo-300/70">Admin</p>
          <h1 className="mt-1 text-2xl font-bold">{contest?.title ?? 'Contest control'}</h1>
        </div>
        <ContestTimer contest={contest} />
      </section>

      {error ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
          {error.includes('Admins only') || error.includes('Sign in') ? (
            <span className="mt-1 block text-red-200/70">
              Sign in with a name matching ADMIN_USER_IDS (default:{' '}
              <code className="text-red-100">dev-admin</code>).
            </span>
          ) : null}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-white/50">
            Status: <span className="font-medium text-white/90">{status ?? '...'}</span>
          </span>
          {contest?.accepting ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
              accepting submissions
            </span>
          ) : (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/40">closed</span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-white/50">Duration (min)</span>
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="mono w-28 rounded-lg border border-white/10 bg-white/5 px-3 py-2 tabular-nums outline-none focus:border-indigo-400"
            />
          </label>

          <button
            disabled={busy || status === CONTEST_STATUS.RUNNING}
            onClick={() => act({ action: 'start', durationMinutes: duration })}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
          >
            Start
          </button>

          <button
            disabled={busy || status !== CONTEST_STATUS.RUNNING}
            onClick={() => act({ action: 'extend', minutes: 5 })}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:border-white/40 disabled:opacity-40"
          >
            +5 min
          </button>

          <button
            disabled={busy || status !== CONTEST_STATUS.RUNNING}
            onClick={() => act({ freezeSubmissions: !contest?.accepting })}
            className="rounded-lg border border-amber-400/30 px-4 py-2 text-sm text-amber-200 transition hover:border-amber-400/60 disabled:opacity-40"
          >
            {contest?.accepting ? 'Freeze' : 'Unfreeze'}
          </button>

          <button
            disabled={busy || status === CONTEST_STATUS.ENDED}
            onClick={() => act({ action: 'end' })}
            className="rounded-lg border border-red-400/30 px-4 py-2 text-sm text-red-200 transition hover:border-red-400/60 disabled:opacity-40"
          >
            End
          </button>

          <button
            disabled={busy}
            onClick={() => act({ action: 'reset' })}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/30 disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Problems ({problems.length})</h2>
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {problems.map((problem) => (
            <li key={problem.slug} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-white/80">{problem.title}</p>
                <p className="mono truncate text-xs text-white/30">{problem.slug}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <span className="mono tabular-nums text-white/40">{problem.points} pts</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/50">
                  {problem.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-white/35">
          Add or edit cards in scripts/problemCards.js and re-run the seeder, or PATCH
          /api/arena/problems/:slug directly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Standings</h2>
        <ArenaLeaderboard rows={leaderboard} problems={problems} />
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useArena } from '@/hooks/useArena';
import { apiFetch } from '@/lib/apiClient';
import { currentUser } from '@/lib/identity';
import CodeEditor from './CodeEditor';
import Terminal from './Terminal';
import { describeField } from '@/lib/playground';
import VerdictPanel from './VerdictPanel';
import ContestTimer from './ContestTimer';

const draftKey = (slug) => `arena:draft:${slug}`;

export default function ProblemWorkspace({ contestKey, problem }) {
  const { contest } = useArena(contestKey);
  const [source, setSource] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  // Restore the draft before first paint of the editor so a refresh mid-contest
  // never costs someone their work.
  useEffect(() => {
    let restored = null;
    try {
      restored = window.localStorage.getItem(draftKey(problem.slug));
    } catch {
      // Private mode; fall back to the starter.
    }
    setSource(restored ?? problem.starterCode ?? '');
    setSignedIn(Boolean(currentUser()));
    setReady(true);
  }, [problem.slug, problem.starterCode]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(draftKey(problem.slug), source);
    } catch {
      // Non-fatal.
    }
  }, [source, problem.slug, ready]);

  const loadHistory = useCallback(() => {
    if (!signedIn) return;
    apiFetch(
      `/api/arena/submissions?key=${encodeURIComponent(contestKey)}&problemSlug=${encodeURIComponent(problem.slug)}`
    )
      .then(setHistory)
      .catch(() => {});
  }, [contestKey, problem.slug, signedIn]);

  useEffect(loadHistory, [loadHistory]);

  const submit = async () => {
    setPending(true);
    setError(null);
    setSubmission(null);

    try {
      const result = await apiFetch('/api/arena/submissions', {
        method: 'POST',
        body: { contestKey, problemSlug: problem.slug, source },
      });
      setSubmission(result);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const accepting = contest?.accepting ?? false;
  const canSubmit = ready && signedIn && !pending && source.trim().length > 0;

  let terminalBlocked = null;
  if (!signedIn) terminalBlocked = 'Enter your name in the top right to use the terminal.';
  else if (!contest) terminalBlocked = 'Connecting...';
  else if (contest.status === 'scheduled') terminalBlocked = 'The terminal opens when the contest starts.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-white/50 transition hover:text-white/80">
          &larr; All problems
        </Link>
        <ContestTimer contest={contest} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section className="space-y-5">
          <header>
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="text-2xl font-bold">{problem.title}</h1>
              <span className="mono shrink-0 text-sm tabular-nums text-indigo-300">
                {problem.points} pts
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  problem.difficulty === 'hard'
                    ? 'bg-red-500/15 text-red-200'
                    : 'bg-amber-500/15 text-amber-200'
                }`}
              >
                {problem.difficulty === 'hard' ? 'Hard' : 'Medium'}
              </span>
              {problem.timeLimitMs}ms per test · {problem.memoryMb}MB · C only
            </p>
          </header>

          {problem.statement ? (
            <p className="text-sm leading-6 text-white/70">{problem.statement}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-white/35">Input</p>
              <p className="mono mt-1 text-sm text-white/80">{problem.inputFormat}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-white/35">Constraints</p>
              <ul className="mono mt-1 space-y-0.5 text-sm text-white/80">
                {problem.judgeFields.map((field) => (
                  <li key={field.name}>{describeField(field)}</li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">
              Explore the pattern
            </h2>
            <Terminal
              slug={problem.slug}
              version={problem.terminalVersion}
              fields={problem.terminalFields}
              contestKey={contestKey}
              available={!terminalBlocked}
              unavailableMessage={terminalBlocked}
            />
            <p className="mt-2 text-xs text-white/35">
              The terminal accepts every value in the constraints. Your program is judged
              on values from the same range.
            </p>
          </div>

          {problem.hint ? (
            <div>
              {showHint ? (
                <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
                  {problem.hint}
                </p>
              ) : (
                <button
                  onClick={() => setShowHint(true)}
                  className="text-sm text-amber-300/70 underline-offset-4 transition hover:text-amber-200 hover:underline"
                >
                  Reveal hint
                </button>
              )}
            </div>
          ) : null}

          {history.length ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">
                Your attempts
              </h2>
              <ul className="space-y-1">
                {history.slice(0, 6).map((item) => (
                  <li
                    key={item._id}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs"
                  >
                    <span className="text-white/50">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="mono tabular-nums text-white/60">
                      {item.passed}/{item.total}
                    </span>
                    <span className="mono tabular-nums text-indigo-300">{item.score} pts</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          {ready ? (
            <CodeEditor value={source} onChange={setSource} disabled={pending} />
          ) : (
            <div className="h-[26rem] animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setSource(problem.starterCode ?? '')}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white/80"
            >
              Reset
            </button>

            <div className="flex items-center gap-3">
              {!accepting ? (
                <span className="text-xs text-white/40">
                  {contest ? 'Submissions are closed' : 'Connecting...'}
                </span>
              ) : null}
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? 'Judging...' : 'Submit'}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <VerdictPanel submission={submission} pending={pending} />
        </section>
      </div>
    </div>
  );
}

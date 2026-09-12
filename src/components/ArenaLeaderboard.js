'use client';

import { currentUser } from '@/lib/identity';
import { useEffect, useState } from 'react';

export default function ArenaLeaderboard({ rows, problems = [], compact = false }) {
  const [meId, setMeId] = useState(null);

  useEffect(() => {
    setMeId(currentUser()?.userId ?? null);
  }, []);

  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
        <p className="text-sm text-white/40">No submissions yet.</p>
      </div>
    );
  }

  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/40">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Contestant</th>
            {!compact &&
              problems.map((problem) => (
                <th key={problem.slug} className="px-3 py-2 text-center font-medium">
                  {problem.order}
                </th>
              ))}
            <th className="px-3 py-2 text-right font-medium">Solved</th>
            <th className="px-3 py-2 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isMe = row.userId === meId;
            return (
              <tr
                key={row.userId}
                className={`border-b border-white/5 last:border-0 ${
                  isMe ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
                }`}
              >
                <td className="mono px-3 py-2 tabular-nums text-white/40">{row.rank}</td>
                <td className="px-3 py-2">
                  <span className={isMe ? 'font-medium text-indigo-200' : 'text-white/80'}>
                    {row.name}
                  </span>
                  {isMe ? <span className="ml-2 text-xs text-indigo-300/70">you</span> : null}
                </td>
                {!compact &&
                  problems.map((problem) => {
                    const score = row.perProblem?.[problem.slug];
                    return (
                      <td
                        key={problem.slug}
                        className="mono px-3 py-2 text-center text-xs tabular-nums"
                      >
                        {score === undefined ? (
                          <span className="text-white/15">-</span>
                        ) : (
                          <span
                            className={
                              score >= problem.points ? 'text-emerald-300' : 'text-amber-300/80'
                            }
                          >
                            {score}
                          </span>
                        )}
                      </td>
                    );
                  })}
                <td className="mono px-3 py-2 text-right tabular-nums text-white/60">
                  {row.solved}
                </td>
                <td className="mono px-3 py-2 text-right font-medium tabular-nums text-indigo-300">
                  {row.totalScore}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

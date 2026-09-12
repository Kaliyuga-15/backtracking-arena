'use client';

import { useEffect, useState } from 'react';
import { CONTEST_STATUS } from '@/lib/constants';

const pad = (value) => String(value).padStart(2, '0');

const formatGap = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

export default function ContestTimer({ contest }) {
  const [now, setNow] = useState(() => Date.now());
  const [skewMs, setSkewMs] = useState(0);

  // Every state push carries the server's clock. Holding the difference means
  // a contestant whose laptop clock is wrong still sees the true remaining time.
  useEffect(() => {
    if (contest?.serverTime) {
      setSkewMs(new Date(contest.serverTime).getTime() - Date.now());
    }
  }, [contest?.serverTime]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!contest) {
    return <span className="text-sm text-white/40">Connecting...</span>;
  }

  const serverNow = now + skewMs;

  if (contest.status === CONTEST_STATUS.SCHEDULED) {
    return (
      <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60">
        Not started
      </span>
    );
  }

  if (contest.status === CONTEST_STATUS.ENDED) {
    return (
      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/60">
        Finished
      </span>
    );
  }

  const remaining = new Date(contest.endsAt).getTime() - serverNow;
  const urgent = remaining < 5 * 60 * 1000;

  return (
    <span
      className={`mono rounded-full px-3 py-1 text-sm font-medium tabular-nums ${
        urgent
          ? 'border border-red-400/40 bg-red-500/15 text-red-200'
          : 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
      }`}
    >
      {remaining > 0 ? `${formatGap(remaining)} left` : 'Time up'}
    </span>
  );
}

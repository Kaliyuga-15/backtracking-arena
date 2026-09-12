'use client';

import { useEffect, useState } from 'react';
import { currentUser, saveDevUser, clearIdentity } from '@/lib/identity';
import { resetArenaSocket } from '@/lib/socketClient';

// Stands in for the real sign-in, which lives in the other project. Once a JWT
// is present in localStorage this collapses to a name and nothing else.
export default function IdentityBadge() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setUser(currentUser());
    setReady(true);
  }, []);

  if (!ready) return <span className="text-sm text-white/30">...</span>;

  if (user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white/60">
          Signed in as <span className="font-medium text-white/90">{user.name}</span>
        </span>
        <button
          onClick={() => {
            clearIdentity();
            resetArenaSocket();
            window.location.reload();
          }}
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/50 transition hover:border-white/30 hover:text-white/80"
        >
          Switch
        </button>
      </div>
    );
  }

  const signIn = (event) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    // Slugged name as the id keeps standalone testing readable; the real ids
    // arrive with the JWT.
    saveDevUser({ userId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name });
    resetArenaSocket();
    window.location.reload();
  };

  return (
    <form onSubmit={signIn} className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Your name"
        maxLength={40}
        className="w-36 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none transition placeholder:text-white/30 focus:border-indigo-400"
      />
      <button
        type="submit"
        className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium transition hover:bg-indigo-400 disabled:opacity-40"
        disabled={!draft.trim()}
      >
        Enter
      </button>
    </form>
  );
}

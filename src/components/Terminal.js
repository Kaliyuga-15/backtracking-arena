'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { describeField, parseTerminalInput } from '@/lib/playground';

const MAX_SAVED_ENTRIES = 60;
const COLLAPSED_LINES = 200;

const storageKey = (slug, version) => `arena:terminal:${slug}:${version}`;

const OutputBlock = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);

  if (entry.pending) {
    return <div className="text-white/35">running...</div>;
  }
  if (entry.error) {
    return <div className="text-red-300/90">{entry.error}</div>;
  }

  const lines = entry.output.replace(/\n$/, '').split('\n');
  if (entry.output.length === 0) {
    return <div className="text-white/30">(no output)</div>;
  }

  const hidden = lines.length - COLLAPSED_LINES;
  const shown = expanded || hidden <= 0 ? lines : lines.slice(0, COLLAPSED_LINES);

  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <pre className="w-max whitespace-pre text-emerald-100/90">{shown.join('\n')}</pre>
      </div>
      {hidden > 0 ? (
        <button
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-xs text-indigo-300/80 hover:text-indigo-200"
        >
          {expanded ? 'Show less' : `... ${hidden} more lines (${lines.length} total) - show all`}
        </button>
      ) : null}
    </div>
  );
};

// A pretend shell wired to the problem's hidden reference program. Every input
// and its output stay in the scrollback so the pattern can be read across runs.
export default function Terminal({ slug, version, fields, contestKey, available, unavailableMessage }) {
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState('');
  const [historyIndex, setHistoryIndex] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const busy = entries.some((entry) => entry.pending);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(slug, version)) ?? '[]');
      setEntries(Array.isArray(saved) ? saved : []);
      // Drop scrollback saved for earlier versions of this card.
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(`arena:terminal:${slug}`) && key !== storageKey(slug, version)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Unreadable history just starts empty.
    }
    setLoaded(true);
  }, [slug, version]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const settled = entries.filter((entry) => !entry.pending).slice(-MAX_SAVED_ENTRIES);
      window.localStorage.setItem(storageKey(slug, version), JSON.stringify(settled));
    } catch {
      // Quota or private mode: scrollback still works for this visit.
    }
  }, [entries, slug, version, loaded]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries]);

  const pastInputs = entries.map((entry) => entry.input);

  const run = async () => {
    const raw = draft;
    if (!raw.trim() || busy) return;

    setDraft('');
    setHistoryIndex(null);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const parsed = parseTerminalInput(raw, fields);

    if (!parsed.ok) {
      setEntries((current) => [...current, { id, input: raw.trim(), error: parsed.message }]);
      return;
    }

    const input = parsed.values.join(' ');
    setEntries((current) => [...current, { id, input, pending: true }]);

    try {
      const result = await apiFetch(`/api/arena/problems/${encodeURIComponent(slug)}/run`, {
        method: 'POST',
        body: { contestKey, input },
      });
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { id, input, output: result.output } : entry))
      );
    } catch (err) {
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { id, input, error: err.message } : entry))
      );
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run();
      return;
    }

    if (event.key === 'ArrowUp' && pastInputs.length) {
      event.preventDefault();
      const next = historyIndex === null ? pastInputs.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setDraft(pastInputs[next]);
      return;
    }

    if (event.key === 'ArrowDown' && historyIndex !== null) {
      event.preventDefault();
      const next = historyIndex + 1;
      if (next >= pastInputs.length) {
        setHistoryIndex(null);
        setDraft('');
      } else {
        setHistoryIndex(next);
        setDraft(pastInputs[next]);
      }
    }
  };

  const names = fields.map((f) => f.name).join(' ');

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#070a14]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
          <span className="mono ml-2 text-xs text-white/40">reference program</span>
        </div>
        <button
          onClick={() => setEntries([])}
          disabled={busy || entries.length === 0}
          className="text-xs text-white/40 transition hover:text-white/80 disabled:opacity-30"
        >
          Clear
        </button>
      </div>

      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="mono scroll-thin h-80 cursor-text overflow-y-auto px-4 py-3 text-sm leading-6"
      >
        {entries.length === 0 ? (
          <p className="text-white/30">
            {available
              ? `Type ${names} and press Enter. Every run stays here so you can compare them.`
              : unavailableMessage}
          </p>
        ) : null}

        {entries.map((entry) => (
          <div key={entry.id} className="mb-3">
            <div>
              <span className="text-indigo-300">$ </span>
              <span className="text-white/90">{entry.input}</span>
            </div>
            <OutputBlock entry={entry} />
          </div>
        ))}

        <div className="flex items-center">
          <span className="text-indigo-300">$&nbsp;</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={!available || busy}
            placeholder={available ? names : ''}
            spellCheck={false}
            autoComplete="off"
            className="mono min-w-0 flex-1 bg-transparent text-white/90 outline-none placeholder:text-white/20 disabled:opacity-40"
          />
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/40">
        Accepts {fields.map(describeField).join(' · ')}. Up/Down recalls earlier inputs.
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';

const Block = ({ label, text, tone = 'default' }) => (
  <div className="min-w-0 flex-1">
    <p className="mb-1 text-[11px] uppercase tracking-wider text-white/35">{label}</p>
    <pre
      className={`mono scroll-thin max-h-56 overflow-auto rounded-lg border px-3 py-2 text-sm leading-6 ${
        tone === 'good'
          ? 'border-emerald-400/25 bg-emerald-500/5 text-emerald-100/90'
          : 'border-white/10 bg-black/30 text-white/80'
      }`}
    >
      {text?.length ? text.replace(/\n$/, '') : <span className="text-white/25">(empty)</span>}
    </pre>
  </div>
);

// The samples are the specification for these problems, so they get the most
// prominent treatment on the page rather than being tucked under prose.
export default function SamplePattern({ samples }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!samples?.length) {
    return <p className="text-sm text-white/40">No examples provided.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {samples.map((sample, index) => (
          <button
            key={index}
            onClick={() => setOpenIndex(index)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              index === openIndex
                ? 'border-indigo-400 bg-indigo-500/20 text-white'
                : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'
            }`}
          >
            Example {index + 1}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Block label="Input" text={samples[openIndex].input} />
        <Block label="Output" text={samples[openIndex].output} tone="good" />
      </div>

      {samples[openIndex].note ? (
        <p className="text-sm text-white/50">{samples[openIndex].note}</p>
      ) : null}
    </div>
  );
}

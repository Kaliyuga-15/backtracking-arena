'use client';

import { TEST_STATUS, VERDICT, VERDICT_LABEL } from '@/lib/constants';

const VERDICT_TONE = {
  [VERDICT.ACCEPTED]: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  [VERDICT.WRONG_ANSWER]: 'border-red-400/40 bg-red-500/15 text-red-200',
  [VERDICT.TIME_LIMIT_EXCEEDED]: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  [VERDICT.MEMORY_LIMIT_EXCEEDED]: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  [VERDICT.RUNTIME_ERROR]: 'border-orange-400/40 bg-orange-500/15 text-orange-200',
  [VERDICT.OUTPUT_LIMIT_EXCEEDED]: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  [VERDICT.COMPILE_ERROR]: 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200',
  [VERDICT.INTERNAL_ERROR]: 'border-white/20 bg-white/10 text-white/70',
};

const STATUS_MARK = {
  [TEST_STATUS.PASSED]: { glyph: 'PASS', className: 'text-emerald-300' },
  [TEST_STATUS.WRONG_ANSWER]: { glyph: 'WA', className: 'text-red-300' },
  [TEST_STATUS.TIME_LIMIT_EXCEEDED]: { glyph: 'TLE', className: 'text-amber-300' },
  [TEST_STATUS.MEMORY_LIMIT_EXCEEDED]: { glyph: 'MLE', className: 'text-amber-300' },
  [TEST_STATUS.RUNTIME_ERROR]: { glyph: 'RE', className: 'text-orange-300' },
  [TEST_STATUS.OUTPUT_LIMIT_EXCEEDED]: { glyph: 'OLE', className: 'text-amber-300' },
  [TEST_STATUS.INTERNAL_ERROR]: { glyph: 'ERR', className: 'text-white/60' },
  [TEST_STATUS.SKIPPED]: { glyph: 'SKIP', className: 'text-white/30' },
};

const Diff = ({ expected, actual }) => (
  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] uppercase tracking-wider text-white/35">Expected</p>
      <pre className="mono scroll-thin max-h-40 overflow-auto rounded-md border border-emerald-400/20 bg-emerald-500/5 px-2 py-1.5 text-xs leading-5 text-emerald-100/80">
        {expected?.replace(/\n$/, '') || '(empty)'}
      </pre>
    </div>
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] uppercase tracking-wider text-white/35">Your output</p>
      <pre className="mono scroll-thin max-h-40 overflow-auto rounded-md border border-red-400/20 bg-red-500/5 px-2 py-1.5 text-xs leading-5 text-red-100/80">
        {actual?.replace(/\n$/, '') || '(empty)'}
      </pre>
    </div>
  </div>
);

export default function VerdictPanel({ submission, pending }) {
  if (pending) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="flex items-center gap-2 text-sm text-white/60">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
          Compiling and running against the tests...
        </p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-4">
        <p className="text-sm text-white/40">
          Submit to see your verdict. Failed small tests show a diff; large tests only report pass or fail.
        </p>
      </div>
    );
  }

  const tone = VERDICT_TONE[submission.verdict] ?? VERDICT_TONE[VERDICT.INTERNAL_ERROR];

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`rounded-full border px-3 py-1 text-sm font-medium ${tone}`}>
          {VERDICT_LABEL[submission.verdict] ?? submission.verdict}
        </span>
        <div className="flex items-center gap-4 text-sm text-white/60">
          <span>
            <span className="mono tabular-nums text-white/90">
              {submission.passed}/{submission.total}
            </span>{' '}
            tests
          </span>
          <span>
            <span className="mono tabular-nums text-indigo-300">{submission.score}</span> pts
          </span>
          <span className="mono tabular-nums text-white/40">{submission.durationMs}ms</span>
        </div>
      </div>

      {submission.compileOutput ? (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-white/35">Compiler</p>
          <pre className="mono scroll-thin max-h-48 overflow-auto rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/5 px-3 py-2 text-xs leading-5 text-fuchsia-100/80">
            {submission.compileOutput}
          </pre>
        </div>
      ) : null}

      {submission.testResults?.length ? (
        <ul className="space-y-2">
          {submission.testResults.map((test, index) => {
            const mark = STATUS_MARK[test.status] ?? STATUS_MARK[TEST_STATUS.INTERNAL_ERROR];
            const showDiff = test.visible && test.status === TEST_STATUS.WRONG_ANSWER;

            return (
              <li key={index} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-white/70">{test.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="mono text-xs tabular-nums text-white/30">{test.timeMs}ms</span>
                    <span className={`mono text-xs font-semibold ${mark.className}`}>
                      {mark.glyph}
                    </span>
                  </span>
                </div>
                {showDiff ? <Diff expected={test.expectedOutput} actual={test.actualOutput} /> : null}
                {test.visible && test.stderr ? (
                  <pre className="mono mt-2 max-h-24 overflow-auto rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/50">
                    {test.stderr}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';

// A textarea with line numbers rather than CodeMirror or Monaco. Those add
// megabytes to a page that ~100 people load at once on contest wifi, and for
// 30 lines of C the only editor affordances that matter are tab handling and
// auto-indent, both of which are handled below.
export default function CodeEditor({ value, onChange, disabled }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const lineCount = Math.max(value.split('\n').length, 1);

  const syncScroll = (event) => {
    if (gutterRef.current) gutterRef.current.scrollTop = event.target.scrollTop;
  };

  const updateCursor = (element) => {
    const upToCaret = element.value.slice(0, element.selectionStart);
    const lines = upToCaret.split('\n');
    setCursor({ line: lines.length, column: lines[lines.length - 1].length + 1 });
  };

  const replaceSelection = (element, text, caretOffset) => {
    const { selectionStart, selectionEnd } = element;
    const next = element.value.slice(0, selectionStart) + text + element.value.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      const position = selectionStart + caretOffset;
      element.selectionStart = position;
      element.selectionEnd = position;
      updateCursor(element);
    });
  };

  const onKeyDown = (event) => {
    const element = event.target;

    if (event.key === 'Tab') {
      event.preventDefault();
      replaceSelection(element, '    ', 4);
      return;
    }

    if (event.key === 'Enter') {
      // Carry the current line's indentation onto the next one, and add a level
      // after an opening brace.
      const upToCaret = element.value.slice(0, element.selectionStart);
      const currentLine = upToCaret.slice(upToCaret.lastIndexOf('\n') + 1);
      const indent = currentLine.match(/^[ \t]*/)?.[0] ?? '';
      const deeper = currentLine.trimEnd().endsWith('{') ? '    ' : '';
      const insertion = `\n${indent}${deeper}`;
      event.preventDefault();
      replaceSelection(element, insertion, insertion.length);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1224]">
      <div className="flex h-[26rem]">
        <div
          ref={gutterRef}
          aria-hidden
          className="mono select-none overflow-hidden border-r border-white/10 bg-white/[0.03] px-3 py-3 text-right text-sm leading-6 text-white/25"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => {
            onChange(event.target.value);
            updateCursor(event.target);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => updateCursor(event.target)}
          onClick={(event) => updateCursor(event.target)}
          onScroll={syncScroll}
          className="editor mono scroll-thin flex-1 bg-transparent px-4 py-3 text-sm leading-6 text-white/90 disabled:opacity-50"
        />
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/40">
        <span>C (gcc -O2 -std=c11)</span>
        <span className="mono tabular-nums">
          Ln {cursor.line}, Col {cursor.column}
        </span>
      </div>
    </div>
  );
}

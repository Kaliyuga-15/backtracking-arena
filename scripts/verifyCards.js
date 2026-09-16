// Audits every seeded card, for EVERY value in its range.
//
//   npm run seed:problems && npm run verify:cards
//
// For each value a card accepts (which is also what the terminal accepts and
// what the judge tests):
//   1. an independent answer is computed in JavaScript - plain brute force
//      where that is feasible, otherwise a different exact method (BigInt
//      dynamic programming, a known sequence, a nearest-value search)
//   2. the stored terminal output must equal it byte for byte
//   3. the C reference is run again on the judge backend: its output must equal
//      it too, have an answer (not empty, "none" or 0), finish within half the
//      time limit and fit the output cap
// Also checks the stored card matches problemCards.js and the terminal range
// equals the displayed constraints.

import './env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Problem } from '../src/models/Problem.js';
import { TerminalOutput } from '../src/models/TerminalOutput.js';
import { runProgramOnInputs } from '../src/lib/judge/index.js';
import { JUDGE_LIMITS, judgeBackend } from '../src/lib/judge/config.js';
import { referenceHash } from '../src/lib/judge/reference.js';
import { problemCards } from './problemCards.js';
import { everyInput, hasAnswer } from './seedProblems.js';

const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const lexNumbers = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
const isPrime = (x) => {
  if (x < 2) return false;
  for (let d = 2; d * d <= x; d++) if (x % d === 0) return false;
  return true;
};
const permutations = function* (items) {
  // Heap's algorithm: deliberately not lexicographic.
  const a = [...items];
  const c = new Array(a.length).fill(0);
  yield [...a];
  let i = 0;
  while (i < a.length) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [a[j], a[i]] = [a[i], a[j]];
      yield [...a];
      c[i] += 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
};
const memo = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = args.join(',');
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
};
const lines = (rows) => `${rows.join('\n')}\n`;
const JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const QUEENS = [1, 0, 0, 2, 10, 4, 40, 92, 352, 724, 2680, 14200, 73712, 365596];
const SEATING = [1, 2, 3, 8, 10, 36, 41, 132, 250, 700, 750, 4010, 4237, 10680, 24679, 87328, 90478, 435812, 449586, 1939684];

// --- card 1 -----------------------------------------------------------------
const distinctPartitions = memo((n) => {
  const found = [];
  const grow = (rest, min, parts) => {
    if (rest === 0) return found.push([...parts].reverse());
    for (let p = min; p <= rest; p++) grow(rest - p, p + 1, [...parts, p]);
  };
  grow(n, 1, []);
  return lines(found.sort((a, b) => -lexNumbers(a, b)).map((p) => p.join(' ')));
});

// --- card 2 -----------------------------------------------------------------
const binaryWithoutRun = memo((n, k) => {
  const found = [];
  for (let code = 0; code < 2 ** n; code++) {
    const s = code.toString(2).padStart(n, '0');
    if (!s.includes('1'.repeat(k))) found.push(s);
  }
  return lines(found.sort());
});

// --- card 3 -----------------------------------------------------------------
const noEchoes = memo((n, k) => {
  const letters = range(0, k - 1).map((i) => String.fromCharCode(97 + i));
  const found = [];
  // Every string over k letters is reachable; a prefix that already contains
  // an echo can never recover, so it is dropped. Order is fixed afterwards by
  // an explicit sort rather than trusted from the generation order.
  const extend = (s) => {
    const i = s.length - 1;
    if (i >= 1 && s[i] === s[i - 1]) return;
    if (i >= 2 && s[i] === s[i - 2]) return;
    if (s.length === n) return found.push(s);
    for (let j = letters.length - 1; j >= 0; j--) extend(s + letters[j]);
  };
  for (const letter of letters) extend(letter);
  return lines(found.sort());
});

// --- card 4 -----------------------------------------------------------------
const roundTable = memo((m) => {
  const n = 2 * m;
  const valid = (ring) => ring.every((v, i) => isPrime(v + ring[(i + 1) % n]));
  if (n <= 10) {
    let best = null;
    for (const rest of permutations(range(2, n))) {
      const ring = [1, ...rest];
      if (valid(ring) && (!best || lexNumbers(ring, best) < 0)) best = ring;
    }
    return `${best.join(' ')}\n`;
  }
  // Smallest-first search, then the ring it returns is re-validated.
  const ring = [1];
  const used = new Set([1]);
  const search = () => {
    if (ring.length === n) return isPrime(ring[n - 1] + 1);
    for (let v = 2; v <= n; v++) {
      if (used.has(v) || !isPrime(ring[ring.length - 1] + v)) continue;
      ring.push(v);
      used.add(v);
      if (search()) return true;
      ring.pop();
      used.delete(v);
    }
    return false;
  };
  if (!search() || !valid(ring) || new Set(ring).size !== n) throw new Error(`no valid ring for m=${m}`);
  return `${ring.join(' ')}\n`;
});

// --- card 5 -----------------------------------------------------------------
const balancedDepths = memo((n) => {
  const depths = [];
  const walk = (open, closed, depth, maxDepth) => {
    if (open === n && closed === n) return depths.push(maxDepth);
    if (open < n) walk(open + 1, closed, depth + 1, Math.max(maxDepth, depth + 1));
    if (closed < open) walk(open, closed + 1, depth - 1, maxDepth);
  };
  walk(0, 0, 0, 0);
  return depths;
});
const shallowNesting = (n, d) => {
  if (n <= 12) return `${balancedDepths(n).filter((depth) => depth <= d).length}\n`;
  // Too many sequences to list: count paths that never exceed depth d.
  let ways = new Array(d + 1).fill(0n);
  ways[0] = 1n;
  for (let step = 0; step < 2 * n; step++) {
    const next = new Array(d + 1).fill(0n);
    for (let depth = 0; depth <= d; depth++) {
      if (!ways[depth]) continue;
      if (depth < d) next[depth + 1] += ways[depth];
      if (depth > 0) next[depth - 1] += ways[depth];
    }
    ways = next;
  }
  return `${ways[0]}\n`;
};

// --- card 6 -----------------------------------------------------------------
const subsetSums = memo((n) => {
  const sums = [];
  for (let mask = 0; mask < 2 ** n; mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += i + 1;
    sums.push(sum);
  }
  return sums;
});
const balancedPicks = (n, m) => {
  if (n <= 18) return `${subsetSums(n).filter((sum) => sum % m === 0).length}\n`;
  let ways = new Array(m).fill(0n);
  ways[0] = 1n;
  for (let i = 1; i <= n; i++) {
    const next = [...ways];
    for (let r = 0; r < m; r++) next[(r + i) % m] += ways[r];
    ways = next;
  }
  return `${ways[0]}\n`;
};

// --- card 7 -----------------------------------------------------------------
const knightWalkCounts = memo((n) => {
  const counts = new Array(9).fill(0);
  const walk = (r, c, length) => {
    counts[length] += 1;
    if (length === 8) return;
    for (const [dr, dc] of JUMPS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) walk(nr, nc, length + 1);
    }
  };
  walk(0, 0, 0);
  return counts;
});
const knightWalks = (n, L) => {
  if (L <= 8) return `${knightWalkCounts(n)[L]}\n`;
  let ways = Array.from({ length: n }, () => new Array(n).fill(0n));
  ways[0][0] = 1n;
  for (let step = 0; step < L; step++) {
    const next = Array.from({ length: n }, () => new Array(n).fill(0n));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!ways[r][c]) continue;
        for (const [dr, dc] of JUMPS) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n) next[nr][nc] += ways[r][c];
        }
      }
    }
    ways = next;
  }
  return `${ways.flat().reduce((sum, v) => sum + v, 0n)}\n`;
};

// --- card 8 -----------------------------------------------------------------
const seatingRules = memo((n) => {
  if (n > 9) return `${SEATING[n - 1]}\n`; // OEIS A320843
  let count = 0;
  for (const p of permutations(range(1, n))) {
    if (p.every((v, i) => v % (i + 1) === 0 || (i + 1) % v === 0)) count += 1;
  }
  if (count !== SEATING[n - 1]) throw new Error(`seating brute force disagrees with OEIS at n=${n}`);
  return `${count}\n`;
});

// --- card 10 ----------------------------------------------------------------
const expressionIndex = memo((n) => {
  const digits = range(1, n).map((i) => ((i - 1) % 9) + 1);
  const gaps = n - 1;
  const firstByValue = new Map();
  // Leftmost gap is the most significant base-3 digit: 0 '+', 1 '-', 2 join, so
  // counting upward walks expressions in the required order.
  for (let code = 0; code < 3 ** gaps; code++) {
    let rest = code;
    const ops = new Array(gaps);
    for (let g = gaps - 1; g >= 0; g--) {
      ops[g] = rest % 3;
      rest = Math.floor(rest / 3);
    }
    let text = String(digits[0]);
    for (let g = 0; g < gaps; g++) text += ['+', '-', ''][ops[g]] + digits[g + 1];
    const value = text.match(/[+-]?\d+/g).reduce((sum, term) => sum + Number(term), 0);
    if (!firstByValue.has(value)) firstByValue.set(value, { code, text });
  }
  const values = [...firstByValue.keys()].sort((a, b) => a - b);
  return { firstByValue, values };
});
const betweenTheDigits = (n, t) => {
  const { firstByValue, values } = expressionIndex(n);
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const around = [values[lo - 1], values[lo]].filter((v) => v !== undefined);
  const distance = Math.min(...around.map((v) => Math.abs(v - t)));
  const tied = [t - distance, t + distance].filter((v) => firstByValue.has(v)).map((v) => firstByValue.get(v));
  tied.sort((a, b) => a.code - b.code);
  return `${tied[0].text}\n`;
};

const independent = {
  'distinct-pieces': ([n]) => distinctPartitions(n),
  'no-long-runs': ([n, k]) => binaryWithoutRun(n, k),
  'no-echoes': ([n, k]) => noEchoes(n, k),
  'round-table': ([m]) => roundTable(m),
  'shallow-nesting': ([n, d]) => shallowNesting(n, d),
  'balanced-picks': ([n, m]) => balancedPicks(n, m),
  'knight-walks': ([n, L]) => knightWalks(n, L),
  'seating-rules': ([n]) => seatingRules(n),
  'safe-placements': ([n]) => `${QUEENS[n - 1]}\n`, // OEIS A000170
  'between-the-digits': ([n, t]) => betweenTheDigits(n, t),
};

// ---------------------------------------------------------------------------

const audit = async (card) => {
  const problems = [];
  let extra = 0;
  const note = (message) => {
    if (problems.length < 6) problems.push(message);
    else extra += 1;
  };

  const stored = await Problem.findOne({ slug: card.slug }).select('+referenceSolution').lean();
  if (!stored) {
    note('not seeded');
  } else {
    const plain = (fields) => JSON.stringify(fields.map(({ name, min, max }) => ({ name, min, max })));
    if (plain(stored.judgeFields) !== plain(card.fields)) note('stored constraints differ from problemCards.js');
    if (plain(stored.terminalFields) !== plain(card.fields)) note('terminal range does not match the constraints');
    if (stored.referenceSolution !== card.referenceSolution) note('stored reference differs from problemCards.js (re-seed)');
  }

  const inputs = everyInput(card.fields);
  const expected = inputs.map((input) => independent[card.slug](input.split(' ').map(Number)));

  // Terminal: stored outputs.
  const rows = await TerminalOutput.find({ slug: card.slug }).lean();
  const byInput = new Map(rows.map((row) => [row.input, row]));
  const hash = referenceHash(card.referenceSolution);
  let terminalWrong = 0;
  inputs.forEach((input, i) => {
    const row = byInput.get(input);
    if (!row) {
      terminalWrong += 1;
      note(`terminal "${input}" has no stored output`);
      return;
    }
    if (row.referenceHash !== hash) note(`terminal "${input}" came from an older reference`);
    if (row.output !== expected[i]) {
      terminalWrong += 1;
      note(`terminal "${input}": stored ${JSON.stringify(row.output.slice(0, 50))} vs independent ${JSON.stringify(expected[i].slice(0, 50))}`);
    }
  });
  if (rows.length !== inputs.length) note(`${rows.length} stored terminal rows for ${inputs.length} values`);

  // Judge: the reference, run fresh on the judge backend. A busy machine can
  // stall one run; a slow program is slow every time. So a run that times out
  // or looks slow is repeated, and the fastest of three attempts is kept.
  const source = card.referenceSolution;
  let judged = await runProgramOnInputs({ source, inputs: inputs.map((input) => `${input}\n`), timeLimitMs: card.timeLimitMs });
  for (let attempt = 0; attempt < 2 && !judged.ok && /timedOut=true|timed out/.test(judged.error); attempt++) {
    judged = await runProgramOnInputs({ source, inputs: inputs.map((input) => `${input}\n`), timeLimitMs: card.timeLimitMs * 3 });
  }
  if (judged.ok) {
    for (const [i, input] of inputs.entries()) {
      for (let attempt = 0; attempt < 2 && judged.timings[i] > card.timeLimitMs / 2; attempt++) {
        const again = await runProgramOnInputs({ source, inputs: [`${input}\n`], timeLimitMs: card.timeLimitMs * 3 });
        if (again.ok) judged.timings[i] = Math.min(judged.timings[i], again.timings[0]);
      }
    }
  }
  let judgeWrong = 0;
  let slowest = { ms: 0, input: '' };
  let largest = 0;
  if (!judged.ok) {
    note(`reference run failed: ${judged.error}`);
  } else {
    inputs.forEach((input, i) => {
      const output = judged.outputs[i];
      const bytes = Buffer.byteLength(output);
      if (judged.timings[i] > slowest.ms) slowest = { ms: judged.timings[i], input };
      largest = Math.max(largest, bytes);
      if (output !== expected[i]) {
        judgeWrong += 1;
        note(`reference "${input}": ${JSON.stringify(output.slice(0, 50))} vs independent ${JSON.stringify(expected[i].slice(0, 50))}`);
      }
      if (!hasAnswer(output)) note(`"${input}" has no answer`);
      if (judged.timings[i] > card.timeLimitMs / 2) note(`"${input}" took ${judged.timings[i]}ms (limit ${card.timeLimitMs}ms)`);
      if (bytes > JUDGE_LIMITS.run.maxOutputBytes) note(`"${input}" exceeds the judge output cap`);
      if (bytes > JUDGE_LIMITS.terminal.maxOutputBytes) note(`"${input}" exceeds the terminal output cap`);
    });
  }

  const ok = problems.length === 0;
  const span = card.fields.map((f) => `${f.name} ${f.min}..${f.max}`).join(', ');
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${card.slug.padEnd(19)} ${String(inputs.length).padStart(5)} values (${span}) · terminal ${terminalWrong} wrong · reference ${judgeWrong} wrong · slowest ${slowest.ms}ms · largest ${(largest / 1024).toFixed(0)}KB`
  );
  for (const problem of problems) console.log(`       ${problem}`);
  if (extra) console.log(`       ...and ${extra} more`);
  return ok;
};

const run = async () => {
  await connectDB();
  console.log(`Backend: ${judgeBackend()}\n`);
  let failed = 0;
  for (const card of problemCards) {
    if (!(await audit(card))) failed++;
  }
  await disconnectDB();
  console.log(failed ? `\n${failed} card(s) need fixing` : '\nall cards verified');
  process.exit(failed ? 1 : 0);
};

run().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});

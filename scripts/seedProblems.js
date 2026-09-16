// Seeds the backtracking cards.
//
//   npm run seed:problems
//
// Every output is produced by running the card's reference solution on the
// configured backend (JUDGE_BACKEND), the same one that grades submissions:
//   - answer keys for the small and large judge tests
//   - the terminal's output for EVERY value in the card's range, stored in
//     the database so the contest never runs code for the terminal
//
// A card is rejected when:
//   - any test input is outside the card's range
//   - any output is empty, "none" or 0: every value in range must have an answer
//   - the reference needs more than half the time limit or exceeds an output cap
//
// `npm run verify:cards` then audits the stored outputs against independent
// brute forces and sweeps the full judge range.

import './env.js';
import { pathToFileURL } from 'node:url';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Problem } from '../src/models/Problem.js';
import { Contest } from '../src/models/Contest.js';
import { TerminalOutput } from '../src/models/TerminalOutput.js';
import { runProgramOnInputs } from '../src/lib/judge/index.js';
import { JUDGE_LIMITS, judgeBackend } from '../src/lib/judge/config.js';
import { referenceHash } from '../src/lib/judge/reference.js';
import { parseTerminalInput } from '../src/lib/playground.js';
import { CONTEST_STATUS, LEVELS, PROBLEM_STATUS } from '../src/lib/constants.js';
import { problemCards } from './problemCards.js';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
const lineCount = (text) => (text.match(/\n/g) ?? []).length;

export const hasAnswer = (output) => {
  const trimmed = output.trim();
  return trimmed.length > 0 && trimmed !== 'none' && trimmed !== '0';
};

export const everyInput = (fields) =>
  fields
    .reduce(
      (acc, field) => {
        const values = Array.from({ length: field.max - field.min + 1 }, (_, i) => field.min + i);
        return acc.flatMap((prefix) => values.map((value) => [...prefix, value]));
      },
      [[]]
    )
    .map((values) => values.join(' '));

const validateCard = (card) => {
  const fail = (message) => {
    throw new Error(`[${card.slug}] ${message}`);
  };

  for (const input of [...card.visibleInputs, ...card.hiddenInputs]) {
    const parsed = parseTerminalInput(input, card.fields);
    if (!parsed.ok) fail(`test input ${JSON.stringify(input)} is outside the card's range: ${parsed.message}`);
  }
};

const seedCard = async (card) => {
  validateCard(card);
  const fail = (message) => {
    throw new Error(`[${card.slug}] ${message}`);
  };

  // --- judge tests ---------------------------------------------------------
  const judgeInputs = [...card.visibleInputs, ...card.hiddenInputs];
  const judged = await runProgramOnInputs({
    source: card.referenceSolution,
    inputs: judgeInputs,
    timeLimitMs: card.timeLimitMs,
  });
  if (!judged.ok) fail(`reference failed: ${judged.error}`);

  judgeInputs.forEach((input, i) => {
    const output = judged.outputs[i];
    if (!hasAnswer(output)) fail(`input ${JSON.stringify(input)} has no answer (${JSON.stringify(output)})`);
    if (judged.timings[i] > card.timeLimitMs / 2) fail(`reference took ${judged.timings[i]}ms on ${JSON.stringify(input)}`);
    if (Buffer.byteLength(output) > JUDGE_LIMITS.run.maxOutputBytes) fail(`output for ${JSON.stringify(input)} exceeds the judge cap`);
  });

  // --- terminal: every accepted input --------------------------------------
  const terminalInputs = everyInput(card.fields);
  const terminal = await runProgramOnInputs({
    source: card.referenceSolution,
    inputs: terminalInputs.map((input) => `${input}\n`),
    timeLimitMs: JUDGE_LIMITS.terminal.timeLimitMs,
    onProgress: (done, total) => process.stdout.write(`\r  terminal ${done}/${total}`),
  });
  if (!terminal.ok) fail(`terminal generation failed: ${terminal.error}`);
  if (terminalInputs.length >= 500) process.stdout.write('\r');

  let largestTerminal = 0;
  terminalInputs.forEach((input, i) => {
    const output = terminal.outputs[i];
    if (!hasAnswer(output)) fail(`terminal input "${input}" has no answer (${JSON.stringify(output)})`);
    const bytes = Buffer.byteLength(output);
    largestTerminal = Math.max(largestTerminal, bytes);
    if (bytes > JUDGE_LIMITS.terminal.maxOutputBytes) fail(`terminal input "${input}" prints more than the terminal returns`);
  });

  // --- store -----------------------------------------------------------------
  const samples = card.visibleInputs.map((input, i) => ({ input, output: judged.outputs[i], note: '' }));
  const hiddenTests = card.hiddenInputs.map((input, i) => ({
    input,
    expectedOutput: judged.outputs[card.visibleInputs.length + i],
  }));

  await Problem.findOneAndUpdate(
    { slug: card.slug },
    {
      $set: {
        slug: card.slug,
        title: card.title,
        level: LEVELS.BACKTRACKING,
        order: card.order,
        difficulty: card.difficulty,
        statement: card.statement,
        inputFormat: card.inputFormat,
        judgeFields: card.fields,
        terminalFields: card.fields,
        hint: card.hint,
        starterCode: card.starterCode,
        samples,
        hiddenTests,
        referenceSolution: card.referenceSolution,
        points: card.points,
        timeLimitMs: card.timeLimitMs,
        status: card.status,
      },
      $unset: { constraints: '' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, strict: false }
  );

  const hash = referenceHash(card.referenceSolution);
  await TerminalOutput.deleteMany({ slug: card.slug });
  const rows = terminalInputs.map((input, i) => ({ slug: card.slug, input, output: terminal.outputs[i], referenceHash: hash }));
  for (let i = 0; i < rows.length; i += 2000) {
    await TerminalOutput.insertMany(rows.slice(i, i + 2000), { ordered: false });
  }

  console.log(`${card.slug} (${card.difficulty}, ${card.points} pts)`);
  hiddenTests.forEach((test, i) => {
    const out = test.expectedOutput;
    const preview = lineCount(out) === 1 ? out.trim() : `${lineCount(out)} lines`;
    const timeMs = judged.timings[card.visibleInputs.length + i];
    console.log(`  large ${test.input.trim().padEnd(18)} ${String(timeMs).padStart(4)}ms ${kb(Buffer.byteLength(out)).padStart(8)}  ${preview.slice(0, 44)}`);
  });
  console.log(`  terminal: ${terminalInputs.length} inputs stored, largest output ${kb(largestTerminal)}\n`);
};

const run = async () => {
  await connectDB();
  console.log(`Backend: ${judgeBackend()}. Generating answer keys and terminal outputs...\n`);

  for (const card of problemCards) {
    await seedCard(card);
  }

  const slugs = problemCards.map((card) => card.slug);
  const archived = await Problem.updateMany(
    { level: LEVELS.BACKTRACKING, slug: { $nin: slugs }, status: { $ne: PROBLEM_STATUS.ARCHIVED } },
    { status: PROBLEM_STATUS.ARCHIVED }
  );
  await TerminalOutput.deleteMany({ slug: { $nin: slugs } });
  if (archived.modifiedCount) console.log(`Archived ${archived.modifiedCount} card(s) no longer listed.`);

  const contest = await Contest.findOneAndUpdate(
    { key: 'backtracking' },
    {
      $setOnInsert: {
        key: 'backtracking',
        title: 'Level 2 - Backtracking',
        level: LEVELS.BACKTRACKING,
        status: CONTEST_STATUS.SCHEDULED,
        durationMinutes: 90,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`Contest "${contest.key}" is ${contest.status} (${contest.durationMinutes} min).`);
  await disconnectDB();
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(async (err) => {
    console.error(`\n${err.message}`);
    await disconnectDB();
    process.exit(1);
  });
}

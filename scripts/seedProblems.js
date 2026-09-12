// Seeds the backtracking cards. Expected outputs are produced by compiling and
// running each card's reference solution in the judge sandbox, so the answer
// key is generated the same way it will later be checked.
//
//   npm run seed:problems

import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Problem } from '../src/models/Problem.js';
import { Contest } from '../src/models/Contest.js';
import { runProgramOnInputs } from '../src/lib/judge/index.js';
import { CONTEST_STATUS, LEVELS } from '../src/lib/constants.js';
import { problemCards } from './problemCards.js';

const preview = (text, lines = 3) => {
  const all = text.replace(/\n$/, '').split('\n');
  const head = all.slice(0, lines).join(' | ');
  return all.length > lines ? `${head} | ... (${all.length} lines)` : head;
};

const seedCard = async (card) => {
  const inputs = [...card.sampleInputs, ...card.hiddenInputs];

  const { ok, outputs, error } = await runProgramOnInputs({
    source: card.referenceSolution,
    inputs,
    timeLimitMs: 10000,
  });

  if (!ok) throw new Error(`[${card.slug}] reference solution failed: ${error}`);

  const samples = card.sampleInputs.map((input, i) => ({
    input,
    output: outputs[i],
    note: '',
  }));

  const hiddenTests = card.hiddenInputs.map((input, i) => ({
    input,
    expectedOutput: outputs[card.sampleInputs.length + i],
  }));

  await Problem.findOneAndUpdate(
    { slug: card.slug },
    {
      slug: card.slug,
      title: card.title,
      level: LEVELS.BACKTRACKING,
      order: card.order,
      statement: card.statement,
      hint: card.hint,
      starterCode: card.starterCode,
      samples,
      hiddenTests,
      referenceSolution: card.referenceSolution,
      points: card.points,
      timeLimitMs: card.timeLimitMs,
      status: card.status,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`  ${card.slug.padEnd(16)} ${samples.length} samples, ${hiddenTests.length} hidden`);
  for (const [i, sample] of samples.entries()) {
    console.log(`    in ${JSON.stringify(sample.input)} -> ${preview(sample.output)}`);
    if (i === samples.length - 1) console.log('');
  }
};

const run = async () => {
  await connectDB();

  console.log('Generating answer keys from reference solutions...\n');
  for (const card of problemCards) {
    await seedCard(card);
  }

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
  console.log('Open /admin to start it.');

  await disconnectDB();
};

run().catch(async (err) => {
  console.error(err.message);
  await disconnectDB();
  process.exit(1);
});

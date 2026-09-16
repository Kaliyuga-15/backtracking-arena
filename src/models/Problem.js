import mongoose from 'mongoose';
import { LEVELS, PROBLEM_STATUS } from '../lib/constants.js';
import { COMPARISON } from '../lib/judge/compare.js';

// One document per card. Adding, editing or retiring a problem is a data
// change -- no deploy, no code edit.

const sampleSchema = new mongoose.Schema(
  {
    input: { type: String, default: '' },
    output: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const hiddenTestSchema = new mongoose.Schema(
  {
    input: { type: String, default: '' },
    expectedOutput: { type: String, default: '' },
  },
  { _id: false }
);

// One integer the terminal reads, with the range it accepts there.
const terminalFieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    level: { type: String, default: LEVELS.BACKTRACKING, index: true },
    order: { type: Number, default: 0 },

    difficulty: { type: String, enum: ['medium', 'hard'], default: 'medium' },

    // The card describes only the input; the output format is left for the
    // contestant to discover through the terminal.
    statement: { type: String, default: '' },
    inputFormat: { type: String, default: '' },
    // Displayed constraints are rendered from these ranges, so the card can
    // never claim a range the judge does not test.
    judgeFields: { type: [terminalFieldSchema], default: [] },
    terminalFields: { type: [terminalFieldSchema], default: [] },
    hint: { type: String, default: '' },
    starterCode: { type: String, default: '' },

    // Small tests inside the terminal range. Never rendered on the card; after a
    // submission they are the cases that come back with an expected/actual diff.
    samples: { type: [sampleSchema], default: [] },

    // select:false so a plain find() can never ship the answer key to a client,
    // the same way Quiz Mania hides `isCorrect`. The judge opts in explicitly
    // with .select('+hiddenTests').
    hiddenTests: { type: [hiddenTestSchema], default: [], select: false },
    referenceSolution: { type: String, default: '', select: false },

    points: { type: Number, default: 100, min: 0 },
    timeLimitMs: { type: Number, default: 2000, min: 100, max: 10000 },
    memoryMb: { type: Number, default: 256, min: 16, max: 1024 },
    comparison: {
      type: String,
      enum: Object.values(COMPARISON),
      default: COMPARISON.TRIMMED,
    },

    status: {
      type: String,
      enum: Object.values(PROBLEM_STATUS),
      default: PROBLEM_STATUS.DRAFT,
      index: true,
    },
  },
  { timestamps: true }
);

problemSchema.index({ level: 1, order: 1 });

export const Problem = mongoose.models.Problem || mongoose.model('Problem', problemSchema);

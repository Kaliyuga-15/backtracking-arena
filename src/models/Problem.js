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

const problemSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    level: { type: String, default: LEVELS.BACKTRACKING, index: true },
    order: { type: Number, default: 0 },

    // Pattern-inference problems intentionally ship with little or no prose --
    // the samples are the specification. Both stay optional.
    statement: { type: String, default: '' },
    hint: { type: String, default: '' },
    starterCode: { type: String, default: '' },

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

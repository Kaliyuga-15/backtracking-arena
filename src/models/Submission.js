import mongoose from 'mongoose';
import { TEST_STATUS, VERDICT } from '../lib/constants.js';

const testResultSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    visible: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(TEST_STATUS), required: true },
    timeMs: { type: Number, default: 0 },
    input: { type: String },
    expectedOutput: { type: String },
    actualOutput: { type: String },
    stderr: { type: String },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    contestKey: { type: String, required: true, index: true },
    problemSlug: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: '' },

    language: { type: String, default: 'c' },
    source: { type: String, required: true },

    verdict: { type: String, enum: Object.values(VERDICT), default: VERDICT.QUEUED },
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    compileOutput: { type: String, default: '' },
    testResults: { type: [testResultSchema], default: [] },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

submissionSchema.index({ contestKey: 1, userId: 1, problemSlug: 1, createdAt: -1 });

export const Submission =
  mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

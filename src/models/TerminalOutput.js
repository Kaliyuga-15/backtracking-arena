import mongoose from 'mongoose';

// The reference program's output for every input a card's terminal accepts,
// generated at seed time. Serving from here keeps contest-time terminal use off
// the shared execution engine entirely.
const terminalOutputSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    input: { type: String, required: true },
    output: { type: String, default: '' },
    // Hash of the reference that produced this row; a changed reference makes
    // older rows stale.
    referenceHash: { type: String, required: true },
  },
  { versionKey: false }
);

terminalOutputSchema.index({ slug: 1, input: 1 }, { unique: true });

export const TerminalOutput =
  mongoose.models.TerminalOutput || mongoose.model('TerminalOutput', terminalOutputSchema);

import mongoose from 'mongoose';
import { CONTEST_STATUS, LEVELS } from '../lib/constants.js';

// One document per level, so the other two levels of the competition can reuse
// this collection by adding their own key.
const contestSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    level: { type: String, default: LEVELS.BACKTRACKING },
    status: {
      type: String,
      enum: Object.values(CONTEST_STATUS),
      default: CONTEST_STATUS.SCHEDULED,
    },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 90, min: 1 },
    // Blocks submissions after the clock runs out; an admin can leave the
    // window open for a late-joining team without reopening the contest.
    freezeSubmissions: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The clock is authoritative on the server. Clients render a countdown from
// endsAt but never decide for themselves whether the contest is live.
contestSchema.methods.isAcceptingSubmissions = function isAcceptingSubmissions() {
  if (this.freezeSubmissions) return false;
  if (this.status !== CONTEST_STATUS.RUNNING) return false;
  const now = Date.now();
  if (this.startsAt && now < this.startsAt.getTime()) return false;
  if (this.endsAt && now > this.endsAt.getTime()) return false;
  return true;
};

contestSchema.methods.toStatePayload = function toStatePayload() {
  return {
    key: this.key,
    title: this.title,
    level: this.level,
    status: this.status,
    startsAt: this.startsAt,
    endsAt: this.endsAt,
    durationMinutes: this.durationMinutes,
    accepting: this.isAcceptingSubmissions(),
    serverTime: new Date(),
  };
};

export const Contest = mongoose.models.Contest || mongoose.model('Contest', contestSchema);

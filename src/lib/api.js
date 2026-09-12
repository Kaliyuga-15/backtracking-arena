import { NextResponse } from 'next/server';

// Matches Quiz Mania's { success, data } / { success, message } envelope so the
// two APIs stay consistent once this folder moves in.
export const ok = (data, status = 200) => NextResponse.json({ success: true, data }, { status });

export const fail = (message, status = 400) =>
  NextResponse.json({ success: false, message }, { status });

// requireIdentity / requireAdmin throw tagged errors; this turns them into
// responses so every route handler stays linear.
export const withErrors = (handler) => async (...args) => {
  try {
    return await handler(...args);
  } catch (err) {
    const status = err.status ?? 500;
    if (status >= 500) console.error('[arena api]', err);
    return fail(err.message || 'Unexpected error', status);
  }
};

export const DEFAULT_CONTEST_KEY = process.env.ARENA_CONTEST_KEY || 'backtracking';

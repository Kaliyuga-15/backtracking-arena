'use client';

// Browser-side identity. In production the surrounding SCIS Connect app drops
// its JWT into localStorage under `arena:token` and everything below just
// forwards it. The dev identity exists so this folder can run standalone before
// the auth project is wired in; it stops working the moment the server sets
// ALLOW_DEV_AUTH=false.

const TOKEN_KEY = 'arena:token';
const DEV_KEY = 'arena:dev-user';

const read = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const getToken = () => read(TOKEN_KEY);

export const setToken = (token) => {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode: the session simply will not persist across reloads.
  }
};

export const getDevUser = () => {
  const raw = read(DEV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const saveDevUser = ({ userId, name }) => {
  const user = { userId: userId.trim(), name: name.trim() || userId.trim() };
  try {
    window.localStorage.setItem(DEV_KEY, JSON.stringify(user));
  } catch {
    // Non-fatal.
  }
  return user;
};

export const clearIdentity = () => {
  try {
    window.localStorage.removeItem(DEV_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Non-fatal.
  }
};

export const currentUser = () => {
  const token = getToken();
  if (token) {
    // Read the display name out of the payload without verifying: the server
    // verifies the signature on every request, this is only for the header bar.
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return {
        userId: String(payload.sub ?? payload.userId ?? ''),
        name: String(payload.name ?? payload.username ?? payload.sub ?? ''),
      };
    } catch {
      return null;
    }
  }
  return getDevUser();
};

export const authHeaders = () => {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };

  const dev = getDevUser();
  if (dev) return { 'x-dev-user-id': dev.userId, 'x-dev-user-name': dev.name };

  return {};
};

// Socket.IO cannot set headers on the websocket transport, so the same values
// ride in the handshake auth object; the server reads either source.
export const socketAuth = () => {
  const token = getToken();
  if (token) return { authorization: `Bearer ${token}` };

  const dev = getDevUser();
  if (dev) return { 'x-dev-user-id': dev.userId, 'x-dev-user-name': dev.name };

  return {};
};

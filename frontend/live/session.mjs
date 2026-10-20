import { ApiError } from './api.mjs';

export const TOKEN_KEY = 'rose.live.access-token';

/** Only the token is stored; identity always comes from /users/me. */
export function createSession({ api, storage = null }) {
  let token = null;
  let user = null;
  let revision = 0;
  let persistent = false;
  try { token = storage?.getItem(TOKEN_KEY) || null; persistent = Boolean(token); } catch { /* Memory-only session. */ }

  function clear() {
    revision += 1;
    token = null;
    user = null;
    persistent = false;
    try { storage?.removeItem(TOKEN_KEY); return true; } catch { return false; }
  }

  return {
    get user() { return user; },
    get hasToken() { return Boolean(token); },
    get persistent() { return persistent; },
    logout: clear,
    async registerForEvent(event, payload) {
      if (!token || !user) throw new ApiError('unauthorized', 'Please log in and verify your account first.', 401);
      const current = revision;
      const identity = user.id;
      let sent = false;
      try {
        const profile = await api.getMe(token);
        if (current !== revision) throw new ApiError('unauthorized', 'Your session changed. Log in again before applying.', 401);
        if (profile.id !== identity || profile.role !== 'user') {
          throw new ApiError('forbidden', 'Use your verified participant account to apply.', 403);
        }
        user = profile;
        sent = true;
        const receipt = await api.registerForEvent(event.public_id, payload, token);
        if (current !== revision || receipt.created_by_user_id !== identity
          || receipt.event_id !== event.id || receipt.channel !== 'online' || receipt.status !== 'pending') {
          throw new ApiError('uncertain', 'The application result cannot be verified. Do not submit it again.');
        }
        return receipt;
      } catch (error) {
        if (current !== revision) {
          if (sent) throw new ApiError('uncertain', 'Your session changed while submitting. Do not submit this application again.');
          throw new ApiError('unauthorized', 'Your session changed. No application was sent. Verify your current account before applying.', 401);
        }
        if (error.status === 401 || (!sent && error.kind === 'forbidden')) clear();
        if (!sent && !['unauthorized', 'forbidden'].includes(error.kind)) {
          throw new ApiError('verification', 'We could not verify your account. No application was sent. Check your login and try again.', error.status);
        }
        throw error;
      }
    },
    async createEvent(payload) {
      if (!token || !user) throw new ApiError('unauthorized', 'Please log in and verify your account first.', 401);
      const current = revision;
      try {
        const event = await api.createEvent(payload, token);
        if (current !== revision) throw new ApiError('aborted', 'Session changed. Check Events before creating again.');
        return event;
      } catch (error) {
        if (current !== revision) throw new ApiError('aborted', 'Session changed. Check Events before creating again.');
        if (error.status === 401) clear();
        throw error;
      }
    },
    async restore() {
      if (!token) return null;
      const current = ++revision;
      user = null;
      try {
        const profile = await api.getMe(token);
        if (current !== revision) return null;
        user = profile;
        return user;
      } catch (error) {
        if (current !== revision) return null;
        if (error.status === 401) clear();
        throw error;
      }
    },
    async signIn(credentials) {
      clear();
      const current = revision;
      const nextToken = await api.login(credentials);
      if (current !== revision) throw new ApiError('aborted', 'Login cancelled.');
      const profile = await api.getMe(nextToken);
      if (current !== revision) throw new ApiError('aborted', 'Login cancelled.');
      token = nextToken;
      user = profile;
      try {
        if (storage) { storage.setItem(TOKEN_KEY, token); persistent = true; }
      } catch { persistent = false; }
      return { user, persistent };
    },
  };
}

export function browserSessionStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

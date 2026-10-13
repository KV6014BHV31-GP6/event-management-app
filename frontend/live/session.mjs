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

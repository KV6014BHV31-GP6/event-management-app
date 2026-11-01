export const OFFLINE_ACCESS_KEY = "rose.offline.synthetic-access.v1";
export function localAccessStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
/** Minimal metadata is a synthetic local convenience, never server authentication. */
export function createSyntheticAccess({
  storage = localAccessStorage(),
  now = () => Date.now(),
} = {}) {
  let saved = null;
  try {
    const record = JSON.parse(storage?.getItem(OFFLINE_ACCESS_KEY) || "null");
    if (
      record?.version === 1 &&
      typeof record.actor?.id === "string" &&
      ["leader", "organizer"].includes(record.actor.role) &&
      Number.isFinite(record.expires_at)
    )
      saved = {
        version: 1,
        actor: { id: record.actor.id, role: record.actor.role },
        verified_at: record.verified_at,
        expires_at: record.expires_at,
        locked: record.locked !== false,
      };
  } catch {
    /* corrupt or inaccessible metadata cannot unlock a workspace */
  }
  const persist = () => {
    try {
      storage?.setItem(OFFLINE_ACCESS_KEY, JSON.stringify(saved));
    } catch {
      /* this page can still work without restart persistence */
    }
  };
  return {
    get candidate() {
      return saved && !saved.locked && saved.expires_at > now()
        ? {
            ...saved.actor,
            verified_at: saved.verified_at,
            expires_at: saved.expires_at,
          }
        : null;
    },
    remember(profile) {
      if (!profile || !["leader", "organizer"].includes(profile.role)) {
        this.lock();
        return null;
      }
      saved = {
        version: 1,
        actor: { id: profile.id, role: profile.role },
        verified_at: new Date(now()).toISOString(),
        expires_at: now() + 7 * 86400000,
        locked: false,
      };
      persist();
      return this.candidate;
    },
    lock() {
      if (saved) {
        saved = { ...saved, locked: true };
        persist();
      }
    },
    unlock({ syntheticConfirmed = false } = {}) {
      if (!syntheticConfirmed || !this.candidate)
        throw new Error(
          "Online login or explicit synthetic local access confirmation is required.",
        );
      return this.candidate;
    },
  };
}

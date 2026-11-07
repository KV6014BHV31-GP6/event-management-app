import { DEMO_PROFILE } from "./demo-transport.js";
import { ApiError, createApi } from "../../live/api.mjs";
import { browserSessionStorage, createSession } from "../../live/session.mjs";
import { createOfflineStore } from "./offline/queue.js";
import { createManualSync } from "./offline/sync.js";
import { createPhase2Api } from "./phase2-api.js";
import { createMinimumRegistrationController } from "./minimum-registration.js";
import { createSyntheticAccess } from "./offline/access.js";
import {
  createGalleryEventController,
  createGalleryEditController,
} from "./gallery-controller.js";

import {
  createEventController,
  createEventImageController,
} from "../../live/create-event.mjs";
import { createEditEventController } from "../../live/edit-event.mjs";
import {
  createRegistrationController,
  createGuestRegistrationController,
} from "../../live/registration.mjs";
import { createRegistrationsController } from "../../live/registrations-page.mjs";

export { ApiError };
export { eventFormValues } from "../../live/edit-event.mjs";
export { safeImagePath } from "../../live/image-path.mjs";

// The original signup module mounts DOM unconditionally. Keep its reviewed payload
// validation here without importing that side effect into React.
export function signupPayload({ username, password } = {}) {
  if (
    typeof username !== "string" ||
    !username.trim() ||
    [...username].length < 3 ||
    [...username].length > 20
  )
    throw new ApiError("validation", "Enter a username with 3–20 characters.");
  if (typeof password !== "string" || [...password].length < 6)
    throw new ApiError(
      "validation",
      "Enter a password with at least 6 characters.",
    );
  if (new TextEncoder().encode(password).length > 72)
    throw new ApiError(
      "validation",
      "Use a password of at most 72 UTF-8 bytes. Some characters use more than one byte.",
    );
  return { username, password };
}

export function observableController(factory, sync = () => {}) {
  const listeners = new Set();
  const controller = factory(() => {
    sync();
    for (const listener of listeners) listener();
  });
  return {
    controller,
    getSnapshot: () => controller.state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createSignupController({ api, onChange = () => {} }) {
  let state = { status: "idle", message: "", user: null };
  const emit = (next) => {
    state = next;
    onChange();
  };
  return {
    get state() {
      return state;
    },
    async submit(values) {
      if (["submitting", "success", "uncertain"].includes(state.status)) return;
      let payload;
      try {
        payload = signupPayload(values);
      } catch (error) {
        emit({ status: "error", message: error.message, user: null });
        return;
      }
      emit({
        status: "submitting",
        message: "Creating your account…",
        user: null,
      });
      try {
        const user = await api.createUser(payload);
        emit({
          status: "success",
          message: "Account created. Log in to continue.",
          user,
        });
      } catch (error) {
        const rejected =
          (error.kind === "duplicate" && error.status === 400) ||
          (error.kind === "validation" && error.status === 422);
        emit({
          status: rejected ? "error" : "uncertain",
          user: null,
          message: rejected
            ? error.message
            : "We could not confirm whether your account was created. Do not submit again. Use Log in to check your account.",
        });
      } finally {
        payload.password = "";
      }
    },
  };
}

/** React owns presentation; reviewed API, Session and write controllers own contracts. */
export function createRuntime({
  api = createPhase2Api(),
  storage = browserSessionStorage(),
  offlineAccessStorage,
} = {}) {
  let bearer = null;
  let offlineActor = null;
  try {
    bearer = storage?.getItem("rose.live.access-token") || null;
  } catch {
    /* unavailable storage never unlocks another actor */
  }
  const syntheticAccess = createSyntheticAccess({
    storage: offlineAccessStorage,
  });
  if (bearer) offlineActor = syntheticAccess.candidate;
  const sessionApi = {
    ...api,
    async login(values) {
      const revision = session.revision;
      const token = await api.login(values);
      if (revision !== session.revision)
        throw new ApiError("aborted", "Login cancelled.");
      bearer = token;
      return token;
    },
  };
  const session = createSession({ api: sessionApi, storage });
  const identityContext = () => ({
    revision: session.revision,
    actorId: session.user?.id ?? null,
    token: bearer,
  });
  const isCurrentIdentity = (context) => Boolean(context &&
    context.revision === session.revision &&
    context.actorId === (session.user?.id ?? null) &&
    context.token === bearer && session.hasToken);
  const changedIdentity = () => new ApiError("aborted", "Your account changed. Verify your login again.");
  const offline = createOfflineStore(DEMO_PROFILE ? {name:"rose-demo-synthetic-offline-v1"} : {});
  const rememberActor = (profile) => {
    offlineActor = syntheticAccess.remember(profile);
  };
  const lockOfflineActor = () => {
    syntheticAccess.lock();
    offlineActor = null;
  };
  const listeners = new Set();
  const stores = new Map();
  let identityBlocked = false;
  let snapshot = {
    user: null,
    hasToken: session.hasToken,
    revision: session.revision,
    persistent: session.persistent,
    checking: true,
    identityBlocked,
    offlineActor,
    offlineCandidate: syntheticAccess.candidate,
    message: "",
  };
  const publish = (patch) => {
    snapshot = {
      ...snapshot,
      user: session.user,
      hasToken: session.hasToken,
      revision: session.revision,
      persistent: session.persistent,
      identityBlocked,
      offlineActor,
      offlineCandidate: syntheticAccess.candidate,
      ...patch,
    };
    for (const listener of listeners) listener();
  };
  const sync = () => {
    // Session intentionally clears rejected credentials on 401. Preserve the
    // failed-identity latch until an explicit local logout, so that clearing a
    // token cannot silently turn an authenticated operation into Guest mode.
    if (snapshot.hasToken && !session.hasToken) {
      identityBlocked = true;
      lockOfflineActor();
    }
    if (
      snapshot.user !== session.user ||
      snapshot.revision !== session.revision ||
      snapshot.hasToken !== session.hasToken
    )
      publish({});
  };
  let restorePromise;
  let runtime;
  let manualIdentity;
  const manualRequest = (method, args) => {
    if (!isCurrentIdentity(manualIdentity) || args[2] !== manualIdentity.token ||
      args[3]?.id !== manualIdentity.verifiedActorId) throw changedIdentity();
    return api[method](...args);
  };
  const manualSync = createManualSync({
    store: offline,
    api: {
      submitOfflineBatch: (...args) => manualRequest("submitOfflineBatch", args),
      getOfflineBatch: (...args) => manualRequest("getOfflineBatch", args),
    },
    verifyIdentity: async (actor) => {
      manualIdentity = null;
      const context = identityContext();
      const verified = await runtime.freshOfflineIdentity(actor);
      if (!isCurrentIdentity(context) || verified.token !== context.token || verified.actor.id !== actor.id)
        throw changedIdentity();
      manualIdentity = { ...context, verifiedActorId: verified.actor.id };
      return verified;
    },
    blockAuth: (status) => {
      if (isCurrentIdentity(manualIdentity)) runtime.blockOfflineAuth(status);
    },
  });
  runtime = {
    api,
    session,
    offline,
    manualSync,
    sync,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    restore() {
      if (!restorePromise) {
        const hadIdentity = session.hasToken;
        const token = bearer;
        const pending = session.restore();
        const revision = session.revision;
        restorePromise = pending
          .then(() => {
            if (revision !== session.revision || token !== bearer) return;
            if (session.user) rememberActor(session.user);
            publish({ checking: false, message: "" });
          })
          .catch((error) => {
            // Only this restore's own current401 clear may advance its epoch once.
            const ownedClear = error.status === 401 && session.revision === revision + 1 &&
              !session.hasToken && !session.user && token === bearer;
            if (!ownedClear && (revision !== session.revision || token !== bearer)) return;
            if (hadIdentity) identityBlocked = true;
            if (error.status === 401) { bearer = null; lockOfflineActor(); }
            publish({ checking: false, message: error.message });
          });
      }
      return restorePromise;
    },
    async signIn(values) {
      lockOfflineActor();
      bearer = null;
      const pending = session.signIn(values);
      const revision = session.revision;
      try {
        const result = await pending;
        if (revision !== session.revision) throw changedIdentity();
        rememberActor(result.user);
        identityBlocked = false;
        publish({
          checking: false,
          message: result.persistent
            ? ""
            : "Session storage is unavailable. Your login lasts only while this page stays open.",
        });
        return result;
      } catch (error) {
        if (revision === session.revision) {
          bearer = null;
          identityBlocked = true;
          publish({ checking: false });
        }
        throw error;
      } finally {
        if (revision === session.revision) sync();
      }
    },
    logout() {
      const removed = session.logout();
      bearer = null;
      lockOfflineActor();
      identityBlocked = false;
      publish({
        checking: false,
        message: removed
          ? "You have logged out on this device. Offline synthetic drafts are retained but locked until the same account logs in."
          : "Logged out in memory. Close this tab to clear unavailable browser storage.",
      });
    },
    unlockSyntheticWorkspace(options) {
      if (session.user || identityBlocked)
        throw new ApiError(
          "forbidden",
          "Log in online again to unlock this account.",
          403,
        );
      offlineActor = syntheticAccess.unlock(options);
      publish({});
      return offlineActor;
    },
    async freshOfflineIdentity(expectedActor) {
      if (!bearer || !session.hasToken || !expectedActor?.id)
        throw new ApiError(
          "unauthorized",
          "Log in online before syncing local drafts.",
          401,
        );
      const context = identityContext();
      try {
        const profile = await api.getMe(context.token);
        if (!isCurrentIdentity(context)) throw changedIdentity();
        if (
          profile.id !== expectedActor.id ||
          !["leader", "organizer"].includes(profile.role)
        )
          throw new ApiError(
            "forbidden",
            "The account or permissions changed. Local drafts are locked.",
            403,
          );
        rememberActor(profile);
        publish({});
        return { actor: { id: profile.id, role: profile.role }, token: context.token };
      } catch (error) {
        if (isCurrentIdentity(context) && [401, 403].includes(error.status)) {
          if (error.status === 401) { session.logout(); bearer = null; }
          identityBlocked = true;
          lockOfflineActor();
          publish({});
        }
        throw error;
      }
    },
    blockOfflineAuth(status) {
      if ([401, 403].includes(status)) {
        if (status === 401) { session.logout(); bearer = null; }
        identityBlocked = true;
        lockOfflineActor();
        publish({});
      }
    },
    async withVerifiedAccount(operation, { roles } = {}) {
      const expected = session.user;
      const context = identityContext();
      if (!expected || !bearer || !session.hasToken)
        throw new ApiError(
          "unauthorized",
          "Please log in and verify your account first.",
          401,
        );
      let sent = false;
      try {
        const profile = await api.getMe(context.token);
        if (!isCurrentIdentity(context)) throw changedIdentity();
        if (
          profile.id !== expected.id ||
          (roles && !roles.includes(profile.role))
        )
          throw new ApiError(
            "forbidden",
            "Your account identity or permissions changed. Log in again.",
            403,
          );
        sent = true;
        const result = await operation(context.token, profile);
        if (!isCurrentIdentity(context))
          throw new ApiError(
            "uncertain",
            "Your session changed while submitting. Do not send this action again.",
          );
        return result;
      } catch (error) {
        if (!isCurrentIdentity(context)) {
          if (sent) throw new ApiError("uncertain", "Your session changed while submitting. Do not send this action again.");
          throw changedIdentity();
        }
        if (error.status === 401) {
          session.logout();
          bearer = null;
          identityBlocked = true;
          lockOfflineActor();
          publish({});
        }
        throw error;
      }
    },
    beginAnotherEvent() {
      const prefix = `${session.revision}:${session.user?.id ?? "guest"}:`;
      const key = `${prefix}create:`;
      if (stores.get(key)?.controller.state.status !== "success") return false;
      stores.delete(key);
      stores.delete(`${prefix}image:create`);
      return true;
    },
    beginAnotherSignup() {
      if (stores.get("signup")?.controller.state.status !== "success")
        return false;
      stores.delete("signup");
      return true;
    },
    beginAnotherEdit(id) {
      const prefix = `${session.revision}:${session.user?.id ?? "guest"}:`;
      const key = `${prefix}edit:${id}`;
      if (stores.get(key)?.controller.state.status !== "success") return false;
      stores.delete(key);
      stores.delete(`${prefix}image:${id}`);
      return true;
    },
    store(kind, { event, mode } = {}) {
      const key =
        kind === "signup"
          ? kind
          : `${session.revision}:${session.user?.id ?? "guest"}:${kind}:${event?.public_id ?? mode ?? ""}`;
      if (!stores.has(key)) {
        const factory = (onChange) => {
          if (kind === "signup")
            return createSignupController({ api, onChange });
          if (kind === "create")
            return createGalleryEventController({ session, onChange });
          if (kind === "image")
            return createEventImageController({ session, onChange });
          if (kind === "edit")
            return createGalleryEditController({ api, session, onChange });
          if (kind === "registration")
            return createMinimumRegistrationController({
              session,
              event,
              onChange,
            });
          if (kind === "guest")
            return createMinimumRegistrationController({
              api,
              session,
              event,
              guest: true,
              canSubmit: () => !identityBlocked && !snapshot.checking,
              onChange,
            });
          if (kind === "records")
            return createRegistrationsController({ session, mode, onChange });
          throw new TypeError("Unknown controller");
        };
        stores.set(key, observableController(factory, sync));
      }
      return stores.get(key);
    },
  };
  return runtime;
}

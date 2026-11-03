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
      const token = await api.login(values);
      bearer = token;
      return token;
    },
  };
  const session = createSession({ api: sessionApi, storage });
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
  const manualSync = createManualSync({
    store: offline,
    api,
    verifyIdentity: (actor) => runtime.freshOfflineIdentity(actor),
    blockAuth: (status) => runtime.blockOfflineAuth(status),
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
        restorePromise = session
          .restore()
          .then(() => {
            if (session.user) rememberActor(session.user);
            publish({ checking: false, message: "" });
          })
          .catch((error) => {
            if (hadIdentity) identityBlocked = true;
            if (error.status === 401) lockOfflineActor();
            publish({ checking: false, message: error.message });
          });
      }
      return restorePromise;
    },
    async signIn(values) {
      lockOfflineActor();
      try {
        const result = await session.signIn(values);
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
        identityBlocked = true;
        publish({ checking: false });
        throw error;
      } finally {
        sync();
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
      const revision = session.revision;
      try {
        const profile = await api.getMe(bearer);
        if (
          revision !== session.revision ||
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
        return { actor: { id: profile.id, role: profile.role }, token: bearer };
      } catch (error) {
        if ([401, 403].includes(error.status)) {
          if (error.status === 401) session.logout();
          identityBlocked = true;
          lockOfflineActor();
          publish({});
        }
        throw error;
      }
    },
    blockOfflineAuth(status) {
      if ([401, 403].includes(status)) {
        if (status === 401) session.logout();
        identityBlocked = true;
        lockOfflineActor();
        publish({});
      }
    },
    async withVerifiedAccount(operation, { roles } = {}) {
      const expected = session.user;
      const revision = session.revision;
      if (!expected || !bearer || !session.hasToken)
        throw new ApiError(
          "unauthorized",
          "Please log in and verify your account first.",
          401,
        );
      try {
        const profile = await api.getMe(bearer);
        if (
          revision !== session.revision ||
          profile.id !== expected.id ||
          (roles && !roles.includes(profile.role))
        )
          throw new ApiError(
            "forbidden",
            "Your account identity or permissions changed. Log in again.",
            403,
          );
        const result = await operation(bearer, profile);
        if (revision !== session.revision || session.user?.id !== expected.id)
          throw new ApiError(
            "uncertain",
            "Your session changed while submitting. Do not send this action again.",
          );
        return result;
      } catch (error) {
        if (error.status === 401) {
          session.logout();
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

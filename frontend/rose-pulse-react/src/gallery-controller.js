import { ApiError } from "../../live/api.mjs";
import { eventPayload } from "../../live/create-event.mjs";
import { editEventPayload, eventFormValues } from "../../live/edit-event.mjs";
const ids = (values) => {
  if (
    !Array.isArray(values) ||
    values.length > 3 ||
    new Set(values).size !== values.length ||
    values.some(
      (id) =>
        typeof id !== "string" || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id),
    )
  )
    throw new ApiError(
      "validation",
      "Choose up to three uploaded event images.",
    );
  return [...values];
};
const imageIds = (event) => (event.image_files || []).map((file) => file.id);
const sameIds = (first, second) =>
  first.length === second.length &&
  first.every((id, index) => id === second[index]);
export function createGalleryEventController({ session, onChange = () => {} }) {
  let state = { status: "idle", message: "", event: null };
  const emit = (next) => {
    state = next;
    onChange(state);
  };
  return {
    get state() {
      return state;
    },
    async submit(values) {
      if (["submitting", "success", "uncertain"].includes(state.status)) return;
      let payload;
      let owner;
      const revision = session.revision;
      try {
        if (session.user?.role !== "organizer")
          throw new ApiError("forbidden", "Organizer account required.", 403);
        owner = session.user.id;
        payload = eventPayload(values);
        if (Object.hasOwn(values, "image_file_ids"))
          payload.image_file_ids = ids(values.image_file_ids);
      } catch (error) {
        emit({ status: "error", message: error.message, event: null });
        return;
      }
      emit({ status: "submitting", message: "Creating event…", event: null });
      try {
        const event = await session.createEvent(payload);
        if (
          session.revision !== revision ||
          session.user?.id !== owner ||
          session.user.role !== "organizer" ||
          event.organizer_id !== owner ||
          (payload.image_file_ids &&
            !sameIds(imageIds(event), payload.image_file_ids))
        )
          throw new ApiError(
            "uncertain",
            "The saved event identity could not be verified.",
          );
        emit({
          status: "success",
          message: "Event created successfully",
          event,
        });
      } catch (error) {
        const known = [
          "unauthorized",
          "forbidden",
          "validation",
          "rate_limit",
        ].includes(error.kind);
        emit({
          status: known ? "error" : "uncertain",
          message: known
            ? error.message
            : "The creation result is unknown. Check Events before creating again to avoid a duplicate.",
          event: null,
        });
      }
    },
  };
}
export function createGalleryEditController({
  api,
  session,
  onChange = () => {},
}) {
  let state = { status: "idle", event: null, message: "" };
  let owner;
  let revision;
  let generation = 0;
  const emit = (next) => {
    state = next;
    onChange(state);
  };
  const current = () =>
    session.user?.role === "organizer" &&
    session.user.id === owner &&
    session.revision === revision;
  return {
    get state() {
      return state;
    },
    async load(id) {
      if (["submitting", "success", "uncertain"].includes(state.status)) return;
      const request = ++generation;
      owner = session.user?.id;
      revision = session.revision;
      emit({
        status: "loading",
        event: null,
        message: "Loading the event from the server…",
      });
      try {
        if (!current())
          throw new ApiError("forbidden", "Organizer account required.", 403);
        const event = await api.getEvent(id);
        if (
          request !== generation ||
          !current() ||
          event.organizer_id !== owner
        )
          throw new ApiError(
            "forbidden",
            "Only the event organizer can edit this event.",
            403,
          );
        eventFormValues(event);
        emit({ status: "ready", event, message: "" });
      } catch (error) {
        if (request === generation)
          emit({ status: "error", event: null, message: error.message });
      }
    },
    async submit(values) {
      if (
        ["loading", "submitting", "success", "uncertain"].includes(state.status)
      )
        return;
      const original = state.event;
      let payload;
      try {
        if (!original || !current())
          throw new ApiError(
            "forbidden",
            "Verify the same organizer account before editing.",
            403,
          );
        const changedImages =
          Object.hasOwn(values, "image_file_ids") &&
          !sameIds(ids(values.image_file_ids), imageIds(original));
        try {
          payload = editEventPayload(values, original);
        } catch (error) {
          if (
            !changedImages ||
            error.message !== "Change an event detail before saving."
          )
            throw error;
          payload = {};
        }
        if (changedImages) payload.image_file_ids = ids(values.image_file_ids);
      } catch (error) {
        emit({ status: "error", event: original, message: error.message });
        return;
      }
      emit({
        status: "submitting",
        event: original,
        message: "Saving event changes…",
      });
      let accepted = false;
      try {
        const saved = await session.updateEvent(original.public_id, payload);
        accepted = true;
        if (
          !current() ||
          saved.id !== original.id ||
          saved.public_id !== original.public_id
        )
          throw new ApiError(
            "contract",
            "The saved event identity could not be verified.",
          );
        const read = await api.getEvent(original.public_id);
        if (
          !current() ||
          read.id !== original.id ||
          read.organizer_id !== owner ||
          !Object.entries(payload).every(([key, value]) =>
            key === "image_file_ids"
              ? sameIds(imageIds(read), value)
              : ["start_time", "end_time"].includes(key)
                ? new Date(read[key]).valueOf() === new Date(value).valueOf()
                : read[key] === value,
          )
        )
          throw new ApiError(
            "contract",
            "The server readback does not match the requested changes.",
          );
        emit({
          status: "success",
          event: read,
          message: "Event updated and read back from the server.",
        });
      } catch (error) {
        const unknown =
          accepted ||
          !current() ||
          ![
            "unauthorized",
            "forbidden",
            "verification",
            "validation",
            "rate_limit",
          ].includes(error.kind);
        emit({
          status: unknown ? "uncertain" : "error",
          event: original,
          message: unknown
            ? "The update result could not be verified. Open the event to check it. Do not submit these changes again."
            : error.message,
        });
      }
    },
  };
}

import { ApiError } from "../../live/api.mjs";
export function minimumRegistrationPayload(values) {
  const limits = { first_name: 20, last_name: 20, phone: 20, national_id: 50 };
  const payload = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (
      typeof values[key] !== "string" ||
      !values[key].trim() ||
      [...values[key]].length > limit
    )
      throw new ApiError(
        "validation",
        "Check the participant fields and their maximum lengths.",
      );
    payload[key] = values[key];
  }
  if (!["male", "female"].includes(values.gender))
    throw new ApiError(
      "validation",
      "Choose a gender from the available options.",
    );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date_of_birth ?? ""))
    throw new ApiError("validation", "Enter a valid date of birth.");
  const date = new Date(`${values.date_of_birth}T00:00:00Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== values.date_of_birth
  )
    throw new ApiError("validation", "Enter a valid date of birth.");
  Object.assign(payload, {
    gender: values.gender,
    date_of_birth: values.date_of_birth,
  });
  for (const key of [
    "address",
    "income_band_code",
    "marriage_status",
    "medical_record",
    "file_ids",
  ])
    if (Object.hasOwn(values, key)) payload[key] = values[key];
  return payload;
}
export function createMinimumRegistrationController({
  api,
  session,
  event,
  guest = false,
  canSubmit = () => true,
  onChange = () => {},
}) {
  let state = { status: "idle", message: "", receipt: null };
  const emit = (next) => {
    state = next;
    onChange(state);
  };
  const anonymous = () => !session.hasToken && !session.user && canSubmit();
  return {
    get state() {
      return state;
    },
    async submit(values) {
      if (["submitting", "success", "uncertain"].includes(state.status)) return;
      let payload;
      const revision = session.revision;
      try {
        if (guest ? !anonymous() : session.user?.role !== "user")
          throw new ApiError(
            "unauthorized",
            "Verify your participant account or explicitly choose Guest.",
            401,
          );
        if (event?.status?.toLowerCase() !== "active")
          throw new ApiError(
            "inactive",
            "This event is not accepting applications.",
          );
        payload = minimumRegistrationPayload(values);
      } catch (error) {
        emit({ status: "error", message: error.message, receipt: null });
        return;
      }
      emit({
        status: "submitting",
        message: guest
          ? "Sending your guest application…"
          : "Verifying your account and sending your application…",
        receipt: null,
      });
      try {
        const receipt = guest
          ? await api.registerGuestForEvent(event.public_id, payload, event.id)
          : await session.registerForEvent(event, payload);
        if (
          revision !== session.revision ||
          (guest && (!anonymous() || receipt.created_by_user_id !== null)) ||
          receipt.event_id !== event.id ||
          receipt.channel !== "online" ||
          receipt.status !== "pending"
        )
          throw new ApiError(
            "uncertain",
            "The application result cannot be verified. Do not submit it again.",
          );
        emit({
          status: "success",
          message: "Application received — pending",
          receipt,
        });
      } catch (error) {
        const changed = revision !== session.revision;
        const known =
          !changed &&
          [
            "unauthorized",
            "forbidden",
            "verification",
            "validation",
            "rate_limit",
            "duplicate",
            "full",
            "inactive",
            "not_found",
          ].includes(error.kind);
        emit({
          status: known ? "error" : "uncertain",
          message: known
            ? error.message
            : "The application result is unknown. Do not submit it again. Ask the organiser to check before trying this event again.",
          receipt: null,
        });
      }
    },
  };
}

import { demoTransport } from "./demo-transport.js";
import {
  ApiError,
  createApi,
  validateRegistrationRead,
  validateEventPage,
} from "../../live/api.mjs";
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const ulid = (value) =>
  typeof value === "string" && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(value);
const publicId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{21}$/.test(value);
const recordedAt = (value) =>
  typeof value === "string" &&
  /(?:Z|\+00:00)$/.test(value) &&
  Number.isFinite(new Date(value).valueOf());
const bad = () => {
  throw new ApiError(
    "contract",
    "The server receipt could not be verified. Do not send the same action again.",
  );
};
const statuses = ["pending", "approved", "waiting", "cancelled", "rejected"];
const codes = [
  "RECORDED",
  "INVALID_APPLICATION",
  "EVENT_CLOSED",
  "EVENT_FULL",
  "IDENTITY_CONFLICT",
  "ALREADY_REGISTERED",
  "FILE_NOT_OWNED",
];
const mimes = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};
export function validateFileReference(file, purpose) {
  if (
    !file ||
    !ulid(file.id) ||
    typeof file.name !== "string" ||
    !file.name ||
    /[\\/\u0000-\u001f]/.test(file.name) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > 8 * 1024 * 1024 ||
    !mimes[file.mime_type] ||
    !["event_image", "supporting_document"].includes(file.purpose) ||
    (purpose && file.purpose !== purpose) ||
    (file.purpose === "event_image" && file.mime_type === "application/pdf") ||
    file.url !== `/api/v2/files/${file.id}/content`
  )
    bad();
  return Object.fromEntries(
    ["id", "name", "mime_type", "size", "purpose", "url"].map((key) => [
      key,
      file[key],
    ]),
  );
}
const fileList = (value, purpose) => {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    new Set(value.map((file) => file.id)).size !== value.length
  )
    bad();
  return value.map((file) => validateFileReference(file, purpose));
};
function eventResponse(data) {
  validateEventPage(
    { data: [data], total_count: 1, total_pages: 1, page: 1, page_size: 1 },
    1,
    1,
  );
  if (
    !Number.isSafeInteger(data.id) ||
    data.id < 1 ||
    !data.title.trim() ||
    !data.location.trim() ||
    !["created_at", "updated_at"].every(
      (key) =>
        typeof data[key] === "string" &&
        Number.isFinite(new Date(data[key]).valueOf()),
    ) ||
    !publicId(data.public_id) ||
    !ulid(data.organizer_id) ||
    !Number.isSafeInteger(data.online_quota) ||
    data.online_quota < 0 ||
    !Number.isSafeInteger(data.offline_quota) ||
    data.offline_quota < 0 ||
    new Date(data.end_time) <= new Date(data.start_time)
  )
    bad();
  if (data.image_files !== undefined) fileList(data.image_files, "event_image");
  return data;
}
export function validateBatchReceipt(data, { actor, eventId, request }) {
  if (
    !data ||
    data.contract_version !== "rose.offline-sync.v2" ||
    data.batch_id !== request.batch_id ||
    data.event_public_id !== eventId ||
    data.actor_id !== actor.id ||
    !recordedAt(data.recorded_at) ||
    !Array.isArray(data.items) ||
    data.items.length !== request.items.length ||
    new Set(data.items.map((item) => item.client_submission_id)).size !==
      data.items.length
  )
    bad();
  const items = data.items.map((item) => {
    if (
      !uuid(item.client_submission_id) ||
      !request.items.some(
        (expected) =>
          expected.client_submission_id === item.client_submission_id,
      ) ||
      !["accepted", "rejected", "duplicate"].includes(item.outcome) ||
      !codes.includes(item.code) ||
      !recordedAt(item.recorded_at) ||
      !(item.registration_id === null || ulid(item.registration_id)) ||
      !(
        item.registration_status_at_recording === null ||
        statuses.includes(item.registration_status_at_recording)
      )
    )
      bad();
    if (
      item.outcome === "accepted" &&
      (item.code !== "RECORDED" ||
        !ulid(item.registration_id) ||
        item.registration_status_at_recording !== "pending")
    )
      bad();
    if (
      item.outcome === "rejected" &&
      (item.registration_id !== null ||
        item.registration_status_at_recording !== null)
    )
      bad();
    return Object.fromEntries(
      [
        "client_submission_id",
        "outcome",
        "code",
        "registration_id",
        "registration_status_at_recording",
        "recorded_at",
      ].map((key) => [key, item[key]]),
    );
  });
  return {
    contract_version: data.contract_version,
    batch_id: data.batch_id,
    event_public_id: data.event_public_id,
    actor_id: data.actor_id,
    recorded_at: data.recorded_at,
    items,
  };
}
export function createPhase2Api({
  fetchImpl = demoTransport.fetch,
  timeoutMs = 15000,
} = {}) {
  const legacy = createApi({ fetchImpl, timeoutMs });
  async function request(
    path,
    { method = "GET", body, multipart, token, expected = 200 } = {},
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetchImpl(path, {
        method,
        headers,
        body:
          multipart ?? (body === undefined ? undefined : JSON.stringify(body)),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        const messages = {
          400: "The server rejected this request. Check the current records.",
          401: "Your login has expired. Log in online again.",
          403: "Your account or current role cannot perform this action.",
          404: "No server receipt was found for this reference.",
          409: "The request conflicted with saved or concurrent work. Reconcile this reference before another action.",
          413: "The selected file is too large.",
          415: "This file type is not supported.",
          422: "Please check the required fields and file limits.",
          429: "Too many requests. Wait before another action.",
        };
        throw new ApiError(
          response.status === 404
            ? "not_found"
            : [400, 409, 413, 415, 422].includes(response.status)
              ? "validation"
              : response.status === 401
                ? "unauthorized"
                : response.status === 403
                  ? "forbidden"
                  : "server",
          messages[response.status] ||
            "The service is unavailable. The write result may be unknown.",
          response.status,
        );
      }
      if (response.status !== expected) bad();
      try {
        return await response.json();
      } catch {
        bad();
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        controller.signal.aborted ? "timeout" : "network",
        "The connection result is unknown. Reconcile saved references before another send.",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async function registration(eventId, payload, token) {
    if (!publicId(eventId))
      throw new ApiError("validation", "Choose a valid event.");
    const body = Object.fromEntries(
      [
        "first_name",
        "last_name",
        "gender",
        "date_of_birth",
        "phone",
        "national_id",
        "address",
        "income_band_code",
        "marriage_status",
        "medical_record",
        "file_ids",
      ]
        .filter((key) => Object.hasOwn(payload, key))
        .map((key) => [key, payload[key]]),
    );
    const data = await request(`/api/v1/events/${eventId}/registrations`, {
      method: "POST",
      body,
      token,
      expected: 201,
    });
    validateRegistrationRead(data);
    if (
      data.channel !== "online" ||
      data.status !== "pending" ||
      Object.entries(body).some(
        ([key, value]) => key !== "file_ids" && data[key] !== value,
      )
    )
      bad();
    for (const key of [
      "address",
      "income_band_code",
      "marriage_status",
      "medical_record",
    ])
      if (!Object.hasOwn(body, key) && data[key] !== null) bad();
    const documents = fileList(
      data.supporting_documents || [],
      "supporting_document",
    );
    const expectedFiles = body.file_ids || [];
    if (
      documents.length !== expectedFiles.length ||
      documents.some((file, index) => file.id !== expectedFiles[index])
    )
      bad();
    data.supporting_documents = documents;
    return data;
  }
  return {
    ...legacy,
    async uploadFile(file, purpose, token) {
      const extension = file?.name?.split(".").at(-1)?.toLowerCase();
      if (!token)
        throw new ApiError(
          "unauthorized",
          "Log in before uploading supporting files.",
          401,
        );
      if (
        !["event_image", "supporting_document"].includes(purpose) ||
        !mimes[file?.type]?.includes(extension) ||
        (purpose === "event_image" && file.type === "application/pdf") ||
        !Number.isSafeInteger(file.size) ||
        file.size < 1 ||
        file.size > 8 * 1024 * 1024
      )
        throw new ApiError(
          "validation",
          "Choose a supported file up to 8 MiB.",
        );
      const multipart = new FormData();
      multipart.append("file", file);
      multipart.append("purpose", purpose);
      const result = validateFileReference(
        await request("/api/v2/files", {
          method: "POST",
          multipart,
          token,
          expected: 201,
        }),
        purpose,
      );
      if (result.size !== file.size) bad();
      return result;
    },
    async downloadSupportingDocument(reference, token, { signal } = {}) {
      const file = validateFileReference(reference, "supporting_document");
      if (!token)
        throw new ApiError(
          "unauthorized",
          "Log in before downloading private documents.",
          401,
        );
      let response;
      try {
        response = await fetchImpl(file.url, {
          signal,
          headers: { Authorization: `Bearer ${token}`, Accept: file.mime_type },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        throw new ApiError("network", "The document could not be downloaded.");
      }
      if (!response.ok)
        throw new ApiError(
          response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : "server",
          response.status === 401 ? "Your login has expired. Log in online again." : response.status === 403 ? "This document is unavailable to your current account." : response.status === 404 ? "This document no longer exists." : "The document service is unavailable. Try reading again.",
          response.status,
        );
      const blob = await response.blob();
      if (blob.size !== file.size || blob.type.split(";")[0] !== file.mime_type)
        bad();
      return blob;
    },
    async getEvent(id, options) {
      return eventResponse(await legacy.getEvent(id, options));
    },
    async getEvents(options) {
      const page = await legacy.getEvents(options);
      for (const event of page.data)
        if (event.image_files !== undefined)
          fileList(event.image_files, "event_image");
      return page;
    },
    async createEvent(payload, token) {
      const body = Object.fromEntries(
        [
          "title",
          "overview",
          "location",
          "start_time",
          "end_time",
          "online_quota",
          "offline_quota",
          "image_path",
          "image_file_ids",
        ]
          .filter((key) => Object.hasOwn(payload, key))
          .map((key) => [key, payload[key]]),
      );
      return eventResponse(
        await request("/api/v1/events", {
          method: "POST",
          body,
          token,
          expected: 201,
        }),
      );
    },
    async updateEvent(id, payload, token) {
      if (!publicId(id))
        throw new ApiError("validation", "Choose a valid event.");
      const data = eventResponse(
        await request(`/api/v1/events/${id}`, {
          method: "PATCH",
          body: payload,
          token,
        }),
      );
      if (data.public_id !== id) bad();
      return data;
    },
    async getOrganizerEvents(token, { page = 1, pageSize = 20 } = {}, actor) {
      const data = await request(
        `/api/v2/me/events?${new URLSearchParams({ page: String(page), pageSize: String(pageSize) })}`,
        { token },
      );
      validateEventPage(data, page, pageSize);
      if (data.data.some((event) => event.organizer_id !== actor.id)) bad();
      return data;
    },
    async getOrganizerRegistrations(token, { status } = {}) {
      if (status && !statuses.includes(status))
        throw new ApiError("validation", "Choose a valid registration status.");
      const data = await request(
        `/api/v2/me/registrations${status ? `?status=${encodeURIComponent(status)}` : ""}`,
        { token },
      );
      if (!Array.isArray(data)) bad();
      return data.map((row) => {
        const read = validateRegistrationRead(row);
        return {
          ...read,
          supporting_documents: fileList(
            row.supporting_documents || [],
            "supporting_document",
          ),
        };
      });
    },
    async getMyRegistrations(token, { status } = {}) {
      if (status && !statuses.includes(status))
        throw new ApiError("validation", "Choose a valid registration status.");
      const data = await request(
        `/api/v1/me/registrations${status ? `?status=${encodeURIComponent(status)}` : ""}`,
        { token },
      );
      if (!Array.isArray(data)) bad();
      return data.map((row) => ({
        ...validateRegistrationRead(row),
        supporting_documents: fileList(
          row.supporting_documents || [],
          "supporting_document",
        ),
      }));
    },
    async getRegistration(id, token) {
      if (!ulid(id))
        throw new ApiError(
          "validation",
          "Choose a valid application reference.",
        );
      const data = await request(`/api/v1/registrations/${id}`, { token });
      const read = validateRegistrationRead(data);
      if (read.id !== id) bad();
      return {
        ...read,
        supporting_documents: fileList(
          data.supporting_documents || [],
          "supporting_document",
        ),
      };
    },
    async organizerCancelRegistration(id, token) {
      if (!ulid(id))
        throw new ApiError(
          "validation",
          "Choose a valid application reference.",
        );
      const data = validateRegistrationRead(
        await request(`/api/v2/registrations/${id}/cancel`, {
          method: "POST",
          token,
        }),
      );
      if (data.id !== id || data.status !== "cancelled") bad();
      return data;
    },
    async getAnalytics(token, actor) {
      const data = await request("/api/v2/analytics/registrations", { token });
      const count = (value) => Number.isSafeInteger(value) && value >= 0;
      if (
        !data ||
        data.actor_id !== actor.id ||
        !recordedAt(data.as_of_utc) ||
        typeof data.source !== "string" ||
        typeof data.definition !== "string" ||
        !count(data.totals?.events) ||
        !count(data.totals?.registrations) ||
        !Array.isArray(data.events) ||
        data.events.length !== data.totals.events
      )
        bad();
      for (const [key, expected] of [
        ["by_status", statuses],
        ["by_channel", ["online", "offline", "walkin", "ocr"]],
      ]) {
        if (
          !data[key] ||
          expected.some((name) => !count(data[key][name])) ||
          Object.values(data[key]).reduce((sum, value) => sum + value, 0) !==
            data.totals.registrations
        )
          bad();
      }
      if (
        data.events.some(
          (event) =>
            !publicId(event.public_id) ||
            typeof event.title !== "string" ||
            !count(event.registrations),
        ) ||
        data.events.reduce((sum, event) => sum + event.registrations, 0) !==
          data.totals.registrations
      )
        bad();
      return data;
    },
    async submitOfflineBatch(eventId, savedRequest, token, actor) {
      if (!publicId(eventId) || !uuid(savedRequest?.batch_id) || !token)
        throw new ApiError("validation", "Choose a valid saved batch.");
      const data = await request(`/api/v2/events/${eventId}/offline-batches`, {
        method: "POST",
        body: savedRequest,
        token,
      });
      return validateBatchReceipt(data, {
        actor,
        eventId,
        request: savedRequest,
      });
    },
    async getOfflineBatch(eventId, savedRequest, token, actor) {
      if (!publicId(eventId) || !uuid(savedRequest?.batch_id) || !token)
        throw new ApiError("validation", "Choose a valid saved batch.");
      const data = await request(
        `/api/v2/events/${eventId}/offline-batches/${savedRequest.batch_id}`,
        { token },
      );
      return validateBatchReceipt(data, {
        actor,
        eventId,
        request: savedRequest,
      });
    },
    registerForEvent(eventId, payload, token) {
      if (!token)
        throw new ApiError(
          "unauthorized",
          "Please log in and verify your account first.",
          401,
        );
      return registration(eventId, payload, token);
    },
    async registerGuestForEvent(eventId, payload, expectedId) {
      const data = await registration(eventId, payload);
      if (data.event_id !== expectedId || data.created_by_user_id !== null)
        bad();
      return data;
    },
  };
}

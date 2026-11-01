import { describe, expect, it, vi } from "vitest";
import { createPhase2Api, validateBatchReceipt } from "./phase2-api.js";
const id = "01K00000000000000000000001";
const actor = { id, role: "leader" };
const eventId = "ABCDEFGHIJKLMNOPQRSTU";
const submission = "12345678-1234-4234-8234-123456789abc";
const batchId = "12345678-1234-4234-8234-123456789abd";
const at = "2026-11-02T00:00:00Z";
const request = {
  contract_version: "rose.offline-sync.v2",
  batch_id: batchId,
  items: [
    {
      client_submission_id: submission,
      application: { first_name: "Synthetic", address: null },
    },
  ],
};
const response = () => ({
  contract_version: request.contract_version,
  batch_id: batchId,
  event_public_id: eventId,
  actor_id: id,
  recorded_at: at,
  items: [
    {
      client_submission_id: submission,
      outcome: "accepted",
      code: "RECORDED",
      registration_id: id,
      registration_status_at_recording: "pending",
      recorded_at: at,
    },
  ],
});
describe("admitted Phase2 API boundary", () => {
  it("preserves strict Create receipt IDs, nonempty fields and timestamps", async () => {
    const event = {
      id: 1,
      public_id: eventId,
      organizer_id: id,
      title: "Synthetic event",
      overview: null,
      location: "Synthetic hall",
      status: "active",
      start_time: "2027-01-01T10:00:00Z",
      end_time: "2027-01-01T11:00:00Z",
      online_quota: 1,
      offline_quota: 0,
      created_at: at,
      updated_at: at,
    };
    for (const change of [
      { id: 0 },
      { title: "" },
      { location: " " },
      { created_at: "not-a-date" },
      { updated_at: null },
    ]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...event, ...change }), {
            status: 201,
          }),
        );
      await expect(
        createPhase2Api({ fetchImpl }).createEvent(event, "synthetic-token"),
      ).rejects.toMatchObject({ kind: "contract" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it("accepts a complete attributed receipt and refuses actor/ID/status drift", () => {
    const valid = response();
    expect(
      validateBatchReceipt(valid, { actor, eventId, request }).items[0].outcome,
    ).toBe("accepted");
    for (const corrupt of [
      { ...valid, actor_id: "other" },
      { ...valid, batch_id: crypto.randomUUID() },
      { ...valid, items: [] },
      {
        ...valid,
        items: [
          { ...valid.items[0], registration_status_at_recording: "approved" },
        ],
      },
      {
        ...valid,
        items: [
          { ...valid.items[0], client_submission_id: crypto.randomUUID() },
        ],
      },
    ])
      expect(() =>
        validateBatchReceipt(corrupt, { actor, eventId, request }),
      ).toThrow("could not be verified");
  });
  it("makes one POST with the unchanged request, bearer header and no-store/no-cookie semantics", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(response()), { status: 200 }),
      );
    const api = createPhase2Api({ fetchImpl });
    await api.submitOfflineBatch(eventId, request, "synthetic-token", actor);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [path, options] = fetchImpl.mock.calls[0];
    expect(path).toBe(`/api/v2/events/${eventId}/offline-batches`);
    expect(options).toMatchObject({
      method: "POST",
      body: JSON.stringify(request),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    expect(options.headers.Authorization).toBe("Bearer synthetic-token");
    expect(path).not.toContain("token");
  });
  it("never converts transport loss into a retry or a success receipt", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("Lost response"));
    await expect(
      createPhase2Api({ fetchImpl }).submitOfflineBatch(
        eventId,
        request,
        "synthetic",
        actor,
      ),
    ).rejects.toMatchObject({ kind: "network" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("genuinely omits minimized fields and requires actual serverNULL in the receipt", async () => {
    const application = {
      first_name: "Synthetic",
      last_name: "Example",
      gender: "female",
      date_of_birth: "1990-01-01",
      phone: "",
      national_id: "",
    };
    const registration = {
      ...application,
      id,
      participant_id: id,
      event_id: 1,
      created_by_user_id: null,
      channel: "online",
      status: "pending",
      address: null,
      income_band_code: null,
      marriage_status: null,
      medical_record: null,
      created_at: at,
      updated_at: at,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(registration), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...registration, address: "" }), {
          status: 201,
        }),
      );
    const api = createPhase2Api({ fetchImpl });
    await api.registerGuestForEvent(eventId, application, 1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    for (const field of [
      "address",
      "income_band_code",
      "marriage_status",
      "medical_record",
    ])
      expect(Object.hasOwn(body, field)).toBe(false);
    await expect(
      api.registerGuestForEvent(eventId, application, 1),
    ).rejects.toMatchObject({ kind: "contract" });
  });
});

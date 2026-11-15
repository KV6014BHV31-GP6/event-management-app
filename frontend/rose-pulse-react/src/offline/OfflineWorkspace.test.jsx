import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OfflineWorkspace from "./OfflineWorkspace.jsx";
import { createOfflineStore, LocalStoreError } from "./queue.js";
import { createManualSync } from "./sync.js";
import { ApiError } from "../../../live/api.mjs";
import { demoTransport } from "../demo-transport.js";

const actor = { id: "01K00000000000000000000001", role: "leader" };
const event = {
  id: 1,
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  title: "Synthetic recovery test",
  location: "Synthetic hall",
  status: "active",
};
const unknown =
  "The connection result is unknown. Reconcile saved references before another send.";
async function setup({ failReadback = false, managed = false, restored = false } = {}) {
  const store = createOfflineStore({
    name: `workspace-recovery-${crypto.randomUUID()}`,
  });
  await store.saveEvent(actor, event, { verifiedOnline: true });
  for (let index = 0; index < 3; index++) {
    const draft = await store.saveDraft(actor, {
      event_public_id: event.public_id,
      application: {
        first_name: "Synthetic",
        last_name: "Example",
        gender: "female",
        date_of_birth: "1990-01-01",
        phone: "TEST",
        national_id: `SYNTHETIC-${index}`,
      },
      syntheticConfirmed: true,
    });
    await store.queue(actor, draft.client_submission_id);
  }
  let lost = false;
  let committed;
  const api = {
    getEvent: vi.fn(async () => managed ? { ...event, workflow: { contract_version: "rose.demo-journey.v1" } } : event),
    submitOfflineBatch: vi.fn(async (_, request) => {
      committed = structuredClone(request);
      lost = true;
      throw new ApiError("network", unknown);
    }),
    getOfflineBatch: vi.fn(async () => ({
      items: committed.items.map((item) => ({
        client_submission_id: item.client_submission_id,
        outcome: "accepted",
        code: "RECORDED",
        registration_status_at_recording: "pending",
      })),
    })),
  };
  const readDrafts = vi.fn(async () => {
    if (lost && failReadback)
      throw new LocalStoreError("offline_storage_unavailable");
    return store.drafts(actor);
  });
  const verifyIdentity = vi.fn(async () => ({
    actor,
    token: "synthetic-token",
  }));
  const runtime = {
    api,
    freshOfflineIdentity: verifyIdentity,
    withVerifiedAccount: vi.fn(() => { throw new Error("The online session has not restored yet."); }),
    offline: { ...store, drafts: readDrafts },
    manualSync: createManualSync({ store, api, verifyIdentity }),
    getSnapshot: () => ({ offlineActor: actor }),
  };
  render(
    <OfflineWorkspace
      runtime={runtime}
      auth={{ offlineActor: actor, user: restored ? null : actor, hasToken: true }}
      initialEvent={event.public_id}
      navigate={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(screen.getAllByText("Pending sync")).toHaveLength(3),
  );
  return { store, api, runtime, readDrafts, user: userEvent.setup(), verifyIdentity };
}
describe("offline workspace after a durable unknown write", () => {
  it("rereads needs_review after the coordinator throws, exposes reconciliation and disables another sync", async () => {
    const { store, api, user, verifyIdentity } = await setup();
    try {
      await user.click(
        screen.getByRole("button", { name: "Manually sync selected event" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(unknown);
      expect(
        (await store.drafts(actor)).every(
          (row) => row.state === "needs_review",
        ),
      ).toBe(true);
      expect(
        await screen.findByRole("button", { name: "Reconcile saved batch" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Manually sync selected event" }),
      ).toBeDisabled();
      expect(screen.getAllByText("Needs review / reconcile")).toHaveLength(3);
      expect(api.getEvent).toHaveBeenCalledWith(event.public_id);
      expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
      expect(api.getOfflineBatch).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("button", { name: "Reconcile saved batch" }),
      );
      await waitFor(() =>
        expect(screen.getAllByText("Synced — not approved")).toHaveLength(3),
      );
      expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
      expect(api.getOfflineBatch).toHaveBeenCalledTimes(1);
      expect(verifyIdentity).toHaveBeenCalledTimes(2);
    } finally {
      await store.close();
    }
  });
  it("keeps the original unknown error when the local refresh also fails, without replaying the POST", async () => {
    const { store, api, readDrafts, user } = await setup({
      failReadback: true,
    });
    try {
      await user.click(
        screen.getByRole("button", { name: "Manually sync selected event" }),
      );
      await waitFor(() => expect(readDrafts).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("alert")).toHaveTextContent(unknown);
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        "Local storage is unavailable.",
      );
      expect(api.getEvent).toHaveBeenCalledWith(event.public_id);
      expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
      expect(api.getOfflineBatch).not.toHaveBeenCalled();
      expect(
        (await store.drafts(actor)).every(
          (row) => row.state === "needs_review",
        ),
      ).toBe(true);
    } finally {
      await store.close();
    }
  });
});

describe("managed Leader manual sync after restoring a saved token", () => {
  it("uses the fresh offline identity for assignment read and the original manual batch", async () => {
    const read = vi.spyOn(demoTransport, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: { assigned: true } }),
    });
    const { store, api, runtime, user, verifyIdentity } = await setup({ managed: true, restored: true });
    try {
      await user.click(screen.getByRole("button", { name: "Manually sync selected event" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(unknown);
      expect(read).toHaveBeenCalledTimes(1);
      expect(read.mock.calls[0][0]).toBe("/api/v2/operations/events/" + event.public_id);
      expect(read.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-token");
      expect(runtime.withVerifiedAccount).not.toHaveBeenCalled();
      expect(verifyIdentity).toHaveBeenCalledTimes(2);
      expect(api.submitOfflineBatch).toHaveBeenCalledTimes(1);
      expect(api.getOfflineBatch).not.toHaveBeenCalled();
      expect((await store.drafts(actor)).every((row) => row.state === "needs_review")).toBe(true);
    } finally {
      read.mockRestore();
      await store.close();
    }
  });

  it("refuses an unassigned managed event before any batch POST", async () => {
    const read = vi.spyOn(demoTransport, "fetch").mockResolvedValue({
      ok: false, status: 403, json: async () => ({ detail: { message: "Not assigned" } }),
    });
    const { store, api, user, verifyIdentity } = await setup({ managed: true, restored: true });
    try {
      await user.click(screen.getAllByRole("button", { name: "Sync this event" })[0]);
      expect(await screen.findByRole("alert")).toHaveTextContent("Your Leader account is not assigned");
      expect(read).toHaveBeenCalledTimes(1);
      expect(verifyIdentity).toHaveBeenCalledTimes(1);
      expect(api.submitOfflineBatch).not.toHaveBeenCalled();
      expect(api.getOfflineBatch).not.toHaveBeenCalled();
      expect((await store.drafts(actor)).every((row) => row.state === "pending_sync")).toBe(true);
    } finally {
      read.mockRestore();
      await store.close();
    }
  });

  it("rejects a changed Leader role without reading the assignment or sending a batch", async () => {
    const read = vi.spyOn(demoTransport, "fetch");
    const { store, api, user, verifyIdentity } = await setup({ managed: true, restored: true });
    verifyIdentity.mockResolvedValue({ actor: { ...actor, role: "organizer" }, token: "synthetic-token" });
    try {
      await user.click(screen.getByRole("button", { name: "Manually sync selected event" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("The selected account or permissions changed");
      expect(read).not.toHaveBeenCalled();
      expect(api.submitOfflineBatch).not.toHaveBeenCalled();
      expect((await store.drafts(actor)).every((row) => row.state === "pending_sync")).toBe(true);
    } finally {
      read.mockRestore();
      await store.close();
    }
  });
});

it('loads named online event choices only on request and downloads the selected event explicitly',async()=>{const store=createOfflineStore({name:'named-choice-'+crypto.randomUUID()});const api={getEvents:vi.fn(async()=>({data:[event]})),getEvent:vi.fn(async()=>event)};const runtime={offline:store,api,freshOfflineIdentity:vi.fn(async()=>({actor,token:'synthetic'})),getSnapshot:()=>({offlineActor:actor})};render(<OfflineWorkspace runtime={runtime} auth={{offlineActor:actor,user:actor,hasToken:true}} navigate={()=>{}}/>);expect(api.getEvents).not.toHaveBeenCalled();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Load available events'}));await screen.findByRole('option',{name:event.title});await waitFor(()=>expect(screen.getByLabelText('Online event')).toBeEnabled());await user.selectOptions(screen.getByLabelText('Online event'),event.public_id);expect(api.getEvent).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Download selected event'}));await waitFor(async()=>expect(await store.events(actor)).toHaveLength(1));expect(api.getEvent).toHaveBeenCalledWith(event.public_id);await store.close();});

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventShare, { publicShare } from "./EventShare.jsx";

vi.mock("./demo-transport.js", () => ({ DEMO_PROFILE: true }));

const origin = "https://demo.example.com";
const event = {
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  title: "Aktiviti café & #1?",
  start_time: "2026-11-15T01:00:00Z",
  end_time: "2026-11-15T02:00:00Z",
  workflow: { timezone: "Asia/Kuala_Lumpur" },
  location: "Dewan & Ruang",
  national_id: "must-not-share",
  token: "must-not-share",
  registration_id: "must-not-share",
};
const url = origin + "/?view=event&event=" + event.public_id;
const locationAt = (value) => vi.stubGlobal("location", new URL(value));

describe("user-triggered public sharing", () => {
  it("builds a canonical URL and includes actual event time and location", () => {
    const share = publicShare(event, origin);
    expect(share.url).toBe(url);
    expect(share.text).toContain(event.title);
    expect(share.text).toContain("09:00");
    expect(share.text).toContain("10:00");
    expect(share.text).toContain("Asia/Kuala_Lumpur");
    expect(share.text).toContain(event.location);
    expect(share.text).not.toContain("must-not-share");
  });

  it.each(["http://127.0.0.1:5205", "https://localhost", "https://127.0.0.2",
    "https://[::1]", "https://0.0.0.0", "https://demo.example.com:5173",
    "https://sub.localhost", "https://host.local"])(
    "keeps external sharing unavailable for %s",
    (unsafe) => {
      locationAt(unsafe);
      render(<EventShare event={event} />);
      expect(screen.queryByRole("link", { name: "Share on WhatsApp" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Messages / SMS" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Copy event link" })).toBeDisabled();
    },
  );

  it("generates a same-event loopback link and copies only after the explicit local action", async () => {
    locationAt("http://127.0.0.1:5291/?view=apply&token=must-not-share#private");
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<EventShare event={event} />);
    const local = "http://127.0.0.1:5291/?view=event&event=" + event.public_id;
    expect(screen.getByLabelText("Local demo link")).toHaveValue(local);
    expect(screen.getByText(/Another phone cannot open it/)).toBeVisible();
    expect(screen.getByRole("button", { name: "WhatsApp demo" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Share on WhatsApp" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Messages / SMS" })).toBeDisabled();
    expect(write).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy demo link" }));
    expect(write).toHaveBeenCalledExactlyOnceWith(local);
    expect(screen.getByRole("status")).toHaveTextContent("Local demo link copied.");
  });

  it("keeps the local link selectable when copying fails", async () => {
    locationAt("http://localhost:5291");
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<EventShare event={event} />);
    await user.click(screen.getByRole("button", { name: "Copy demo link" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Select the local demo link and copy it manually/);
    expect(screen.getByLabelText("Local demo link")).toHaveAttribute("readonly");
  });

  it("opens a local WhatsApp simulation, copies only on demand and restores focus on Escape", async () => {
    locationAt("http://127.0.0.1:5291/?token=must-not-share");
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<EventShare event={event} />);
    const trigger = screen.getByRole("button", { name: "WhatsApp demo" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "WhatsApp demo" });
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    expect(dialog).toHaveAccessibleDescription(/No message was sent/);
    const local = "http://127.0.0.1:5291/?view=event&event=" + event.public_id;
    const preview = within(dialog).getByLabelText("WhatsApp demo message");
    expect(preview.value).toBe(publicShare(event).text + "\n" + local);
    expect(preview.value).not.toContain("must-not-share");
    expect(within(dialog).getByRole("link", { name: "Open event" })).toHaveAttribute("href", local);
    expect(write).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Copy message" }));
    expect(write).toHaveBeenCalledExactlyOnceWith(preview.value);
    expect(within(dialog).getByRole("status")).toHaveTextContent("Event share message copied.");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the simulated WhatsApp message selectable when copying fails", async () => {
    locationAt("http://localhost:5291");
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<EventShare event={event} />);
    const trigger = screen.getByRole("button", { name: "WhatsApp demo" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "WhatsApp demo" });
    await user.click(within(dialog).getByRole("button", { name: "Copy message" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(/Select and copy the message below/);
    expect(within(dialog).getByLabelText("WhatsApp demo message")).toHaveAttribute("readonly");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(trigger).toHaveFocus();
  });

  it("opens only user-triggered actions, encodes WhatsApp once and preserves a selectable fallback", async () => {
    locationAt(origin);
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<EventShare event={event} />);
    const link = screen.getByRole("link", { name: "Share on WhatsApp" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(new URL(link.href).searchParams.get("text")).toBe(screen.getByLabelText("Event share message").value);
    expect(link.href).not.toContain("must-not-share");
    expect(write).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy event link" }));
    expect(write).toHaveBeenCalledExactlyOnceWith(url);
    expect(screen.getByRole("status")).toHaveTextContent("Public event link copied.");
  });

  it("uses Web Share from a click and treats AbortError as cancellation", async () => {
    locationAt(origin);
    vi.stubGlobal("isSecureContext", true);
    const share = vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError"));
    vi.stubGlobal("navigator", { share, canShare: () => true });
    render(<EventShare event={event} />);
    const button = screen.getByRole("button", { name: "Messages / SMS" });
    expect(share).not.toHaveBeenCalled();
    button.click();
    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: event.title,
      text: publicShare(event, origin).text,
      url,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Sharing cancelled.");
  });

  it("explains fallback when native sharing and Clipboard are unavailable", async () => {
    locationAt(origin);
    vi.stubGlobal("isSecureContext", false);
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<EventShare event={event} />);
    expect(screen.getByRole("button", { name: "Messages / SMS" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Copy share message" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Copy is unavailable/);
    expect(screen.getByLabelText("Event share message").value).toContain(url);
  });
});

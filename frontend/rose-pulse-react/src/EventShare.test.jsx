import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventShare, { publicShare } from "./EventShare.jsx";
const event = {
  public_id: "ABCDEFGHIJKLMNOPQRSTU",
  title: "Synthetic public activity",
  national_id: "must-not-share",
  token: "must-not-share",
  registration_id: "must-not-share",
};
describe("user-triggered public sharing", () => {
  it("shares only public title and a freshly constructed link, never current query/auth/registration details", () => {
    window.history.replaceState(
      {},
      "",
      "/?view=apply&token=must-not-share&registration=must-not-share",
    );
    const share = publicShare(event);
    expect(share.text).toBe(
      `${event.title}\n${window.location.origin}/?view=event&event=${event.public_id}`,
    );
    expect(share.text).not.toContain("must-not-share");
  });
  it("does not copy or open an external service until the user clicks", async () => {
    const user = userEvent.setup();
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    render(<EventShare event={event} />);
    expect(write).not.toHaveBeenCalled();
    const link = screen.getByRole("link", { name: "Share on WhatsApp" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(decodeURIComponent(link.href)).toContain(event.title);
    expect(link.href).not.toContain("must-not-share");
    await user.click(screen.getByRole("button", { name: "Copy event link" }));
    expect(write).toHaveBeenCalledTimes(1);
  });
});

import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApplicationSuccess from "./ApplicationSuccess.jsx";

const props = () => ({
  eventTitle: "Synthetic event",
  reference: "DEMO-RECEIPT",
  onDismiss: vi.fn(),
  onView: vi.fn(),
  onDone: vi.fn(),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps the pending reference available until the user chooses what to do", () => {
  const callbacks = props();
  render(<ApplicationSuccess {...callbacks} />);
  const dialog = screen.getByRole("dialog", { name: "Application submitted successfully" });
  act(() => vi.advanceTimersByTime(60000));
  expect(dialog).toHaveAttribute("open");
  expect(dialog).toHaveTextContent(callbacks.reference);
  expect(dialog).toHaveTextContent("Pending");
  expect(dialog).toHaveAccessibleDescription(/Awaiting organiser review/);
  expect(within(dialog).getByRole("button", { name: "Copy reference" })).toBeEnabled();
  expect(callbacks.onDone).not.toHaveBeenCalled();
});

it.each([
  ["Close", "onDismiss"],
  ["View application", "onView"],
  ["Back to event", "onDone"],
  ["Escape", "onDismiss"],
  ["unmount", null],
])("runs only the chosen receipt action on %s", (action, expected) => {
  const callbacks = props();
  const view = render(<ApplicationSuccess {...callbacks} />);
  const dialog = screen.getByRole("dialog");
  act(() => vi.advanceTimersByTime(4999));
  if (action === "unmount") view.unmount();
  else if (action === "Escape") fireEvent(dialog, new Event("cancel", { cancelable: true }));
  else fireEvent.click(within(dialog).getByRole("button", { name: action }));
  act(() => vi.advanceTimersByTime(6000));
  for (const name of ["onDismiss", "onView", "onDone"])
    expect(callbacks[name]).toHaveBeenCalledTimes(name === expected ? 1 : 0);
});

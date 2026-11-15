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

it("returns once at five seconds using the latest handler without restarting on rerender", () => {
  const initial = props();
  const current = vi.fn();
  const view = render(<ApplicationSuccess {...initial} />);
  const dialog = screen.getByRole("dialog", { name: "Application submitted successfully" });
  expect(dialog).toHaveAccessibleDescription(/Returning to the event in 5 seconds/);
  expect(dialog).toHaveTextContent(initial.reference);
  act(() => vi.advanceTimersByTime(3000));
  view.rerender(<ApplicationSuccess {...initial} onDone={current} />);
  act(() => vi.advanceTimersByTime(1999));
  expect(initial.onDone).not.toHaveBeenCalled();
  expect(current).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(current).toHaveBeenCalledTimes(1);
  expect(dialog).not.toHaveAttribute("open");
  act(() => vi.advanceTimersByTime(5000));
  expect(current).toHaveBeenCalledTimes(1);
});

it.each([
  ["Close", "onDismiss"],
  ["View application", "onView"],
  ["Back to event", "onDone"],
  ["Escape", "onDismiss"],
  ["unmount", null],
])("cancels the automatic return on %s", (action, expected) => {
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

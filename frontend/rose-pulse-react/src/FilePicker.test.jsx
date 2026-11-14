import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilePicker, PrivateDocuments } from "./FilePicker.jsx";
import { ApiError } from "./service.js";
const id = "01K00000000000000000000001";
const fileReference = (index = 1, purpose = "event_image") => ({
  id: `01K0000000000000000000000${index}`,
  name: `synthetic-${index}.png`,
  mime_type: "image/png",
  size: 3,
  purpose,
  url: `/api/v2/files/01K0000000000000000000000${index}/content`,
});
describe("three-file gallery and authenticated supporting documents", () => {
  it("previews three files, removes/replaces a selection and emits only uploaded IDs", async () => {
    const onChange = vi.fn(),
      onBlocked = vi.fn();
    let count = 0;
    const runtime = {
      api: { uploadFile: vi.fn(async () => fileReference(++count)) },
      withVerifiedAccount: vi.fn((operation) => operation("synthetic-token")),
    };
    render(
      <FilePicker
        runtime={runtime}
        purpose="event_image"
        onChange={onChange}
        onBlocked={onBlocked}
      />,
    );
    const user = userEvent.setup();
    const input = screen.getByLabelText(/Event image/);
    await user.upload(
      input,
      [1, 2, 3].map(
        (number) =>
          new File(["abc"], `synthetic-${number}.png`, { type: "image/png" }),
      ),
    );
    expect(screen.getAllByAltText(/Selected event image/)).toHaveLength(3);
    expect(input).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove file 2" }));
    await user.upload(
      input,
      new File(["abc"], "synthetic-replacement.png", { type: "image/png" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /synthetic test data only/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Upload selected files" }),
    );
    await waitFor(() =>
      expect(runtime.api.uploadFile).toHaveBeenCalledTimes(3),
    );
    await waitFor(() => expect(onChange.mock.lastCall[0]).toHaveLength(3));
    expect(runtime.withVerifiedAccount).toHaveBeenCalledTimes(3);
  });
  it("locks an uncertain upload and prevents remove/re-upload/resend", async () => {
    const runtime = {
      api: {
        uploadFile: vi.fn().mockRejectedValue(new ApiError("network", "lost")),
      },
      withVerifiedAccount: (operation) => operation("synthetic"),
    };
    render(
      <FilePicker
        runtime={runtime}
        purpose="supporting_document"
        onChange={vi.fn()}
        onBlocked={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText(/Supporting documents/),
      new File(["abc"], "synthetic.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /synthetic test data only/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Upload selected files" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("unknown");
    expect(
      screen.getByRole("button", { name: "Upload selected files" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove file 1" }),
    ).toBeDisabled();
    expect(runtime.api.uploadFile).toHaveBeenCalledTimes(1);
  });
  it("fetches a private document with verified auth and revokes its Blob download URL", async () => {
    const file = {
      ...fileReference(1, "supporting_document"),
      mime_type: "application/pdf",
      name: "synthetic.pdf",
    };
    const blob = new Blob(["abc"], { type: "application/pdf" });
    const runtime = {
      api: { downloadSupportingDocument: vi.fn().mockResolvedValue(blob) },
      withVerifiedAccount: vi.fn((operation) => operation("synthetic-token")),
    };
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<PrivateDocuments runtime={runtime} files={[file]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Download synthetic.pdf" }),
    );
    await waitFor(() =>
      expect(runtime.api.downloadSupportingDocument).toHaveBeenCalledWith(
        file,
        "synthetic-token",
        { signal: expect.any(AbortSignal) },
      ),
    );
    expect(click).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(revoke).toHaveBeenCalled());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

it("previews chosen documents and replaces a rejected file while retaining successful references", async () => {
  const onChange = vi.fn();
  const onBlocked = vi.fn();
  const uploadFile = vi.fn(async (file) => {
    if (file.name === "reject.pdf") throw new ApiError("validation", "Please check the required fields and file limits.", 422);
    return {...fileReference(file.name === "good.png" ? 1 : 2, "supporting_document"),
      name: file.name, mime_type: file.type, size: file.size};
  });
  const runtime = {
    api: {uploadFile},
    withVerifiedAccount: (operation) => operation("synthetic"),
  };
  render(<FilePicker runtime={runtime} purpose="supporting_document" onChange={onChange} onBlocked={onBlocked} />);
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText(/Supporting documents/), [
    new File(["abc"], "good.png", {type: "image/png"}),
    new File(["abc"], "reject.pdf", {type: "application/pdf"}),
  ]);
  expect(screen.getByAltText("Selected document image 1")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
  expect(screen.getByRole("link", {name: "Download to view PDF"})).toHaveAttribute("download", "reject.pdf");
  expect(screen.getByText(/application\/pdf · 3/)).toBeVisible();
  expect(onBlocked.mock.lastCall[0]).toBe(true);
  await user.click(screen.getByRole("checkbox", {name: /synthetic test data only/}));
  await user.click(screen.getByRole("button", {name: "Upload selected files"}));
  expect(await screen.findByText("Upload failed")).toBeVisible();
  expect(onChange.mock.lastCall[0].map((file) => file.name)).toEqual(["good.png"]);
  await user.click(screen.getByRole("button", {name: "Replace file 2"}));
  expect(screen.getByText("reject.pdf")).toBeVisible();
  const replacement = screen.getByLabelText("Choose replacement file");
  await user.upload(replacement, new File(["xyz"], "replacement.pdf", {type: "application/pdf"}));
  expect(screen.queryByText("reject.pdf")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Upload selected files"}));
  await waitFor(() => expect(onChange.mock.lastCall[0].map((file) => file.name)).toEqual(["good.png", "replacement.pdf"]));
  expect(onBlocked.mock.lastCall[0]).toBe(false);
  expect(uploadFile.mock.calls.map(([file]) => file.name)).toEqual(["good.png", "reject.pdf", "replacement.pdf"]);
});

it.each([
  ["empty.pdf", "application/pdf", 0, /file is empty/],
  ["large.pdf", "application/pdf", 8 * 1024 * 1024 + 1, /too large/],
  ["mislabelled.png", "application/pdf", 1, /extension does not match/],
  ["phone.HEIC", "image/heic", 1, /HEIC and HEIF are unsupported/],
])("rejects %s before creating a preview or starting an upload", async (name, mime, size, message) => {
  const uploadFile = vi.fn();
  render(<FilePicker runtime={{api: {uploadFile}}} purpose="supporting_document"
    onChange={vi.fn()} onBlocked={vi.fn()} />);
  const user = userEvent.setup({applyAccept: false});
  await user.upload(screen.getByLabelText(/Supporting documents/), new File([new Uint8Array(size)], name, {type: mime}));
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText(name)).not.toBeInTheDocument();
  expect(uploadFile).not.toHaveBeenCalled();
});

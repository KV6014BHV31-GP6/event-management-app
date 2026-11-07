import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrivateDocuments } from './FilePicker.jsx';
it('shows an explicit empty document state', () => {
  render(<PrivateDocuments runtime={{}} files={[]} />);
  expect(screen.getByText('No supporting documents.')).toBeInTheDocument();
});
it('authenticated image opens a labelled viewer and Escape restores trigger focus', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = vi.fn();
  const runtime = {
    withVerifiedAccount: fn => fn('token'),
    api: {
      downloadSupportingDocument: vi.fn(async () => new Blob(['abc'], {
        type: 'image/png'
      }))
    }
  };
  render(<PrivateDocuments runtime={runtime} files={[{
    id: 'one',
    name: 'proof.png',
    mime_type: 'image/png'
  }]} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', {
    name: 'Preview proof.png'
  });
  await user.click(trigger);
  expect(await screen.findByRole('dialog', {
    name: 'proof.png'
  })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it('ignores a late private response after record change and aborts the old request', async () => {
  let resolve;
  let signal;
  URL.createObjectURL = vi.fn(() => 'blob:private');
  URL.revokeObjectURL = vi.fn();
  const runtime = {
    withVerifiedAccount: fn => fn('token'),
    api: {
      downloadSupportingDocument: vi.fn((file, token, options) => {
        signal = options.signal;
        return new Promise(r => resolve = r);
      })
    }
  };
  const view = render(<PrivateDocuments runtime={runtime} recordId="first" files={[{
    id: 'one',
    name: 'proof.png',
    mime_type: 'image/png'
  }]} />);
  await waitFor(() => expect(runtime.api.downloadSupportingDocument).toHaveBeenCalledTimes(1));
  view.rerender(<PrivateDocuments runtime={runtime} recordId="second" files={[]} />);
  expect(signal.aborted).toBe(true);
  resolve(new Blob(['abc'], {
    type: 'image/png'
  }));
  await waitFor(() => expect(screen.getByText('No supporting documents.')).toBeInTheDocument());
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('uses an explicit PDF download fallback without embedding a private document URL', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:pdf');
  URL.revokeObjectURL = vi.fn();
  const runtime = {
    withVerifiedAccount: fn => fn('token'),
    api: {
      downloadSupportingDocument: vi.fn(async () => new Blob(['abc'], {
        type: 'application/pdf'
      }))
    }
  };
  render(<PrivateDocuments runtime={runtime} files={[{
    id: 'pdf',
    name: 'proof.pdf',
    mime_type: 'application/pdf'
  }]} />);
  await userEvent.click(screen.getByRole('button', {
    name: 'Preview proof.pdf'
  }));
  expect(await screen.findByText('PDF inline preview is unavailable in this build. Download the original to inspect it in a trusted viewer.')).toBeInTheDocument();
  expect(document.querySelector('iframe,object,embed')).toBeNull();
});

it('keeps Escape and Tab inside a document dialog nested in a registration dialog',async()=>{
 URL.createObjectURL=vi.fn(()=> 'blob:private');URL.revokeObjectURL=vi.fn();const parentKey=vi.fn();const runtime={withVerifiedAccount:fn=>fn('token'),api:{downloadSupportingDocument:vi.fn(async()=>new Blob(['abc'],{type:'image/png'}))}};
 render(<section role="dialog" aria-label="Registration" onKeyDown={parentKey}><PrivateDocuments runtime={runtime} recordId="record" files={[{id:'one',name:'proof.png',mime_type:'image/png'}]}/></section>);
 const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Preview proof.png'}));await screen.findByRole('dialog',{name:'proof.png'});parentKey.mockClear();await user.keyboard('{Tab}');expect(parentKey).not.toHaveBeenCalled();await user.keyboard('{Escape}');expect(parentKey).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'Registration'})).toBeInTheDocument();
});

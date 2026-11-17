import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { tr } from './i18n/index.js';
const noop = () => () => {};
const empty = () => null;
const shownName = file => file.name === 'synthetic-demo-supporting-document.pdf' ? 'sample-supporting-document.pdf' : file.name;
export function PrivateDocuments({
  runtime,
  files = [],
  recordId = '',
  thumbnailOnly = false
}) {
  const auth = useSyncExternalStore(runtime.subscribe || noop, runtime.getSnapshot || empty);
  const identity = `${auth?.revision || 0}:${auth?.user?.id || ''}:${recordId}:${files.map(f => f.id).join(',')}`;
  const previewOwner = useRef({ runtime, id: auth?.user?.id, revision: auth?.revision });
  if (thumbnailOnly && (!auth?.user || auth.checking || auth.identityBlocked ||
    previewOwner.current.runtime !== runtime || previewOwner.current.id !== auth.user.id ||
    previewOwner.current.revision !== auth.revision)) return null;
  return <DocumentSession key={identity} runtime={runtime} files={files} thumbnailOnly={thumbnailOnly} />;
}
function DocumentSession({ runtime, files, thumbnailOnly }) {
  const [selected, setSelected] = useState(null);
  const cards = (
    <div className={thumbnailOnly ? "document-cards document-cards-compact" : "document-cards"}>
      {files.map(file => <DocumentCard key={file.id} runtime={runtime} file={file}
        thumbnailOnly={thumbnailOnly} onPreview={trigger => setSelected({ file, trigger })} />)}
    </div>
  );
  if (thumbnailOnly) return cards;
  return <section className="private-documents"><h4>{tr('Supporting documents')} ({files.length})</h4>
 <p className="small muted">{tr('Private downloads verify your current account. No document is cached for offline access.')}</p>
 {!files.length && <p>{tr('No supporting documents.')}</p>}
 {cards}
 {selected && <DocumentViewer runtime={runtime} file={selected.file} onClose={() => {
      setSelected(null);
      selected.trigger?.focus();
    }} />}</section>;
}
function usePrivateBlob(runtime, file, enabled = true) {
  const [state, setState] = useState({
    url: null,
    error: '',
    loading: enabled
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      url;
    const controller = new AbortController();
    setState({
      url: null,
      error: '',
      loading: true
    });
    runtime.withVerifiedAccount(token => runtime.api.downloadSupportingDocument(file, token, {
      signal: controller.signal
    })).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setState({
        url,
        error: '',
        loading: false
      });
    }).catch(error => {
      if (active) setState({
        url: null,
        error: error.message || 'The document could not be downloaded.',
        loading: false
      });
    });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [runtime, file.id, enabled]);
  return state;
}
function DocumentCard({
  runtime,
  file,
  onPreview,
  thumbnailOnly
}) {
  const image = file.mime_type?.startsWith('image/');
  const state = usePrivateBlob(runtime, file, image);
  const [failed, setFailed] = useState(false);
  const [download, setDownload] = useState(false);
  const original = usePrivateBlob(runtime, file, download);
  useEffect(() => {
    if (!original.url) return;
    const link = document.createElement('a');
    link.href = original.url;
    link.download = shownName(file);
    link.click();
    const timer = setTimeout(() => setDownload(false), 0);
    return () => clearTimeout(timer);
  }, [original.url]);
  const label = <>
    {image && state.url && !failed
      ? <img src={state.url} alt={`${tr('Document thumbnail')}: ${shownName(file)}`} onError={() => setFailed(true)} />
      : <span className="document-symbol">{image ? tr('Image') : tr('PDF document')}</span>}
    <strong>{shownName(file)}</strong>
  </>;
  return <article className="document-card">
 {thumbnailOnly ? label : (
   <button type="button" className="document-preview-trigger"
     aria-label={tr('Preview') + ' ' + shownName(file)} onClick={event => onPreview(event.currentTarget)}>
     {label}
   </button>
 )}
 <span className="small muted">{file.mime_type}</span>
 <span role="status" className="small">{tr(state.loading ? 'Loading private document…' : state.error || failed ? 'Preview unavailable' : 'Private document')}</span>
 {state.error && <p role="alert">{tr(state.error)}</p>}
 {!thumbnailOnly && <div className="form-actions">
 <button type="button" className="text-button" disabled={original.loading && download} onClick={() => setDownload(true)}>{tr('Download')} {shownName(file)}</button></div>}
 {original.error && <p role="alert">{tr(original.error)}</p>}
 </article>;
}
function DocumentViewer({
  runtime,
  file,
  onClose
}) {
  const state = usePrivateBlob(runtime, file);
  const image = file.mime_type.startsWith('image/');
  const panel = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    panel.current?.querySelector('button')?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const keyboard = event => {
    if (['Escape','Tab'].includes(event.key)) event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Tab') {
      const nodes = [...panel.current.querySelectorAll('button:not(:disabled),a[href]')];
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  return <div className="document-backdrop"><section ref={panel} className="document-viewer" role="dialog" aria-modal="true" aria-label={shownName(file)} onKeyDown={keyboard}>
 <h2>{shownName(file)}</h2>
 <div className="document-toolbar">
   <button className="button" onClick={onClose}>{tr('Close')}</button>
   {image && <>
     <button className="button button-quiet" onClick={() => setZoom(1)}>{tr('Fit')}</button>
     <button className="button button-quiet" aria-label={tr('Zoom out')} disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(.5, z - .25))}>−</button>
     <span>{Math.round(zoom * 100)}%</span>
     <button className="button button-quiet" aria-label={tr('Zoom in')} disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + .25))}>+</button>
   </>}
   {state.url && <>
     <a className="button" href={state.url} target="_blank" rel="noopener noreferrer">{tr('Open original')}</a>
     <a className="button button-quiet" href={state.url} download={shownName(file)}>{tr('Download')}</a>
   </>}
 </div>
 {state.loading && <p role="status">{tr('Loading private document…')}</p>}{state.error && <p role="alert">{tr(state.error)}</p>}
 <div className="document-stage">{state.url && (image && !failed ? <img src={state.url} style={{
          width: `${zoom * 100}%`
        }} alt={shownName(file)} onError={() => setFailed(true)} /> : <p>{tr(file.mime_type === 'application/pdf' ? 'Open the PDF in a new tab or download the original.' : 'Preview unavailable. Download the original document to inspect it in a trusted viewer.')}</p>)}</div>
 </section></div>;
}

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { tr } from './i18n/index.js';
const noop = () => () => {};
const empty = () => null;
export function PrivateDocuments({
  runtime,
  files = [],
  recordId = ''
}) {
  const auth = useSyncExternalStore(runtime.subscribe || noop, runtime.getSnapshot || empty);
  const identity = `${auth?.revision || 0}:${auth?.user?.id || ''}:${recordId}:${files.map(f => f.id).join(',')}`;
  return <DocumentSession key={identity} runtime={runtime} files={files} />;
}
function DocumentSession({
  runtime,
  files
}) {
  const [selected, setSelected] = useState(null);
  return <section className="private-documents"><h4>{tr('Supporting documents')} ({files.length})</h4>
 <p className="small muted">{tr('Private downloads verify your current account. No document is cached for offline access.')}</p>
 {!files.length && <p>{tr('No supporting documents.')}</p>}
 <div className="document-cards">{files.map(file => <DocumentCard key={file.id} runtime={runtime} file={file} onPreview={trigger => setSelected({
        file,
        trigger
      })} />)}</div>
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
  onPreview
}) {
  const image = file.mime_type.startsWith('image/');
  const state = usePrivateBlob(runtime, file, image);
  const [failed, setFailed] = useState(false);
  const [download, setDownload] = useState(false);
  const original = usePrivateBlob(runtime, file, download);
  useEffect(() => {
    if (!original.url) return;
    const link = document.createElement('a');
    link.href = original.url;
    link.download = file.name;
    link.click();
    const timer = setTimeout(() => setDownload(false), 0);
    return () => clearTimeout(timer);
  }, [original.url]);
  return <article className="document-card">
 {image && state.url && !failed ? <img src={state.url} alt={`${tr('Document thumbnail')}: ${file.name}`} onError={() => setFailed(true)} /> : <div className="document-symbol">{image ? tr('Image') : tr('PDF document')}</div>}
 <strong>{file.name}</strong><span className="small muted">{file.mime_type}</span>
 <span role="status" className="small">{tr(state.loading ? 'Loading private document…' : state.error || failed ? 'Preview unavailable' : 'Private document')}</span>
 {state.error && <p role="alert">{tr(state.error)}</p>}
 <div className="form-actions"><button type="button" className="button button-small" onClick={event => onPreview(event.currentTarget)}>{tr('Preview')} {file.name}</button>
 <button type="button" className="text-button" disabled={original.loading && download} onClick={() => setDownload(true)}>{tr('Download')} {file.name}</button></div>
 {original.error && <p role="alert">{tr(original.error)}</p>}
 </article>;
}
function DocumentViewer({
  runtime,
  file,
  onClose
}) {
  const state = usePrivateBlob(runtime, file);
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
  return <div className="document-backdrop"><section ref={panel} className="document-viewer" role="dialog" aria-modal="true" aria-label={file.name} onKeyDown={keyboard}>
 <h2>{file.name}</h2><div className="document-toolbar"><button className="button" onClick={onClose}>{tr('Close')}</button><button className="button button-quiet" onClick={() => setZoom(1)}>{tr('Fit')}</button><button className="button button-quiet" aria-label={tr('Zoom out')} disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(.5, z - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button className="button button-quiet" aria-label={tr('Zoom in')} disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + .25))}>+</button>{state.url && <a className="button" href={state.url} download={file.name}>{tr('Download')}</a>}</div>
 {state.loading && <p role="status">{tr('Loading private document…')}</p>}{state.error && <p role="alert">{tr(state.error)}</p>}
 <div className="document-stage">{state.url && (file.mime_type.startsWith('image/') && !failed ? <img src={state.url} style={{
          width: `${zoom * 100}%`
        }} alt={file.name} onError={() => setFailed(true)} /> : <p>{tr(file.mime_type === 'application/pdf' ? 'PDF inline preview is unavailable in this build. Download the original to inspect it in a trusted viewer.' : 'Preview unavailable. Download the original document to inspect it in a trusted viewer.')}</p>)}</div>
 </section></div>;
}

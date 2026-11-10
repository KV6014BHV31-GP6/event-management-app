import React, { useSyncExternalStore } from 'react';
import { demoTransport, DEMO_PROFILE } from './demo-transport.js';
import { tr } from './i18n/index.js';
export function DemoImage(props) {
  const state = useSyncExternalStore(demoTransport.subscribe, demoTransport.getSnapshot);
  if (DEMO_PROFILE && state.mode === 'offline' && props.src && !/^(blob:|data:|\/images\/)/.test(props.src)) return <span role="img" aria-label={props.alt} className="image-fallback">{tr('Image unavailable in simulated offline mode')}</span>;
  return <img {...props} />;
}
export function DemoControls({
  navigate
}) {
  const s = useSyncExternalStore(demoTransport.subscribe, demoTransport.getSnapshot);
  if (!DEMO_PROFILE) return null;
  return (
    <details className="demo-tools" aria-label={tr('Synthetic demo controls')}>
      <summary tabIndex={0}>{tr('Demo tools · Synthetic data')}</summary>
      <div className="demo-controls">
        <strong>{tr('SYNTHETIC DEMO — fictional data')}</strong>
        <span role="status">{tr(s.mode === 'offline' ? 'Simulated Offline' : 'Connected')}</span>
        <button className="button button-small" onClick={() => demoTransport.offline()}>
          {tr('Simulated Offline')}
        </button>
        <button className="button button-quiet button-small" onClick={() => demoTransport.restore()}>
          {tr('Restore Connection')}
        </button>
        <button className="button button-quiet button-small" disabled={s.loseAck} onClick={() => demoTransport.loseNextAck()}>
          {tr(s.loseAck ? 'Next sync ACK will be lost' : 'Lose next sync acknowledgement')}
        </button>
        <button className="button button-quiet button-small" onClick={() => navigate('offline')}>
          {tr('Reconcile')}
        </button>
        <small>
          {tr('Restore never syncs automatically. Use the saved batch Reconcile action.')} · {tr('Requests')}: {s.requests} · {tr('Blocked')}: {s.blocked} · {import.meta.env.VITE_DEMO_BUILD_SHA || import.meta.env.VITE_RELEASE_SHA || 'development'}
        </small>
      </div>
    </details>
  );
}

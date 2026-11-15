import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { demoTransport, DEMO_PROFILE } from './demo-transport.js';
import { tr } from './i18n/index.js';
const DemoToolsContext = createContext(null);

export function DemoToolsProvider({ children }) {
  const [actions, setActions] = useState({});
  const register = useCallback((name, action) => {
    setActions((current) => ({ ...current, [name]: action }));
    return () => setActions((current) =>
      current[name] === action ? { ...current, [name]: undefined } : current);
  }, []);
  return <DemoToolsContext.Provider value={{ actions, register }}>{children}</DemoToolsContext.Provider>;
}

export function useDemoTool(name, action, enabled = true) {
  const register = useContext(DemoToolsContext)?.register;
  const current = useRef(action);
  current.current = action;
  useEffect(() => {
    if (DEMO_PROFILE && enabled && register) return register(name, () => current.current());
  }, [enabled, name, register]);
}

export function DemoImage(props) {
  const state = useSyncExternalStore(demoTransport.subscribe, demoTransport.getSnapshot);
  if (DEMO_PROFILE && state.mode === 'offline' && props.src && !/^(blob:|data:|\/images\/)/.test(props.src)) return <span role="img" aria-label={props.alt} className="image-fallback">{tr('Image unavailable in simulated offline mode')}</span>;
  return <img {...props} />;
}
export function DemoControls({
  navigate
}) {
  const actions = useContext(DemoToolsContext)?.actions || {};
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
        {Object.entries(actions).map(([label, action]) => action && (
          <button key={label} className="button button-quiet button-small" type="button" onClick={action}>
            {tr(label)}
          </button>
        ))}
        <small>
          {tr('Restore never syncs automatically. Use the saved batch Reconcile action.')} · {tr('Requests')}: {s.requests} · {tr('Blocked')}: {s.blocked} · {import.meta.env.VITE_DEMO_BUILD_SHA || import.meta.env.VITE_RELEASE_SHA || 'development'}
        </small>
      </div>
    </details>
  );
}

import { useEffect, useRef, useState } from 'react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import { cachedRead, readCacheKey, rememberRead } from './read-cache.js';
import { useReferenceRefresh } from './useReferenceRefresh.js';
import { UsedByAgents } from './UsedByAgents.js';
import { STUDIO_RPC, type LightningTypeView as LightningTypeData } from '../../../lib/studio-contract.js';
import { EmptyState } from '../components/SalesforceState.js';

/**
 * Read-only Lightning Type tab: the schema's properties, the agents whose actions declare the type, the LWCs its renderer
 * and editor override with, and the bundle's raw JSON (schema.json plus each channel's renderer/editor). Standard and missing types explain themselves.
 */
export function LightningTypeView({ pluginId, projectId, typeRef, usedBy, onOpenAgent, onOpenComponent }: {
  pluginId: string;
  projectId?: string;
  typeRef: string;
  usedBy?: string[];
  onOpenAgent(path: string): void;
  onOpenComponent?(ref: string): void;
}) {
  const key = readCacheKey(pluginId, projectId, 'lightning-type', typeRef);
  const root = useRef<HTMLElement>(null);
  const { data, error, busy, refresh } = useReferenceRefresh<LightningTypeData>({
    scope: key, projectId, element: root, initial: cachedRead<LightningTypeData>(key),
    paths: data => data?.path ? [data.path] : [],
    read: async () => {
      const res = await callPluginRpc(pluginId, STUDIO_RPC.lightningType, { ...(projectId ? { projectId } : {}), ref: typeRef }) as { ok?: boolean; data?: LightningTypeData; error?: string } | null;
      if (!res?.ok || !res.data) throw Error(res?.error || 'The Lightning Type could not be read.');
      return res.data;
    },
    remember: data => rememberRead(key, data),
  });
  const [selection, setSelection] = useState<{ scope: string; path?: string }>({ scope: key });
  const selected = selection.scope === key ? selection.path : undefined;
  const shown = data?.files.find(row => row.path === selected) ?? data?.files[0];
  const file = shown?.path;
  useEffect(() => {
    // A click can commit before this passive fallback effect. Preserve the newer choice.
    setSelection(previous => previous !== selection || previous.scope === key && previous.path === file ? previous : { scope: key, path: file });
  }, [file, key, selection]);

  return <section ref={root} className="sf-lt" data-testid="lightning-type-view" aria-label={`Lightning Type ${typeRef}`}>
    <header className="sf-lt-head">
      <div>
        <h2>{data?.title || typeRef}</h2>
        <div className="sf-lt-meta">
          <code>{typeRef}</code>
          <span className="sf-lt-badge">{data ? data.standard ? 'Standard' : data.status === 'missing' ? 'Not in project' : 'Custom' : 'Lightning Type'}</span>
          {data?.path && <span className="sf-lt-path" title={data.path}>{data.path}</span>}
        </div>
        {data?.description && <p>{data.description}</p>}
      </div>
      <button type="button" className="sf-atp-btn" disabled={busy} onClick={refresh} aria-label="Refresh Lightning Type">Refresh</button>
    </header>
    {!data && busy && <p className="sf-lt-note">Loading…</p>}
    {error && <p className="sf-lt-note is-error" role="alert">{error}</p>}
    {data?.message && <p className={`sf-lt-note${data.status === 'ready' ? ' is-warn' : ''}`}>{data.message}</p>}
    {usedBy && usedBy.length > 0 && <dl className="sf-lt-rel"><UsedByAgents usedBy={usedBy} onOpenAgent={onOpenAgent} /></dl>}
    {data?.status === 'ready' && <div className="sf-lt-section">
      {data.baseType && <><h3>Schema type</h3><p className="sf-lt-note"><code>{data.baseType}</code></p></>}
      <h3>Properties</h3>
      {data.properties.length === 0
        ? <EmptyState compact art="code" title={data.baseType?.startsWith('@apexClassType/') ? 'Apex-backed schema' : 'No properties'}>{data.baseType?.startsWith('@apexClassType/') ? 'Fields are defined by the Apex class.' : 'The schema declares no top-level properties.'}</EmptyState>
        : <table className="sf-lt-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Description</th></tr></thead>
          <tbody>{data.properties.map(row => <tr key={row.name}>
            <td><code>{row.name}</code>{row.required && <span className="sf-lt-req" title="Required">*</span>}{row.title && <div className="sf-lt-sub">{row.title}</div>}</td>
            <td><code>{row.type ?? '—'}</code></td>
            <td>{row.description ?? ''}</td>
          </tr>)}</tbody>
        </table>}
    </div>}
    {data && (data.components?.length ?? 0) > 0 && <div className="sf-lt-section">
      <h3>Components</h3>
      <table className="sf-lt-table" aria-label="Components">
        <thead><tr><th scope="col">Component</th><th scope="col">Role</th><th scope="col">Channel</th><th scope="col">Overrides</th></tr></thead>
        <tbody>{data.components.map(row => <tr key={`${row.channel}:${row.role}:${row.target}:${row.ref}`}>
          <td>{onOpenComponent
            ? <button type="button" className="af-text-button" title={row.path ?? row.ref} onClick={() => onOpenComponent(row.ref)}>{row.ref}</button>
            : <code>{row.ref}</code>}
            {!row.path && <span className="sf-lt-sub">Not in this project</span>}</td>
          <td>{row.role === 'editor' ? 'Editor' : 'Renderer'}</td>
          <td><code>{row.channel || '—'}</code></td>
          <td>{row.target === '$' ? 'Whole type' : <code>{row.target}</code>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {data && data.files.length > 0 && <div className="sf-lt-section">
      <h3>Bundle files</h3>
      <div className="sf-lt-files" role="group" aria-label="Bundle files">
        {data.files.map(row => <button key={row.path} type="button" aria-pressed={row.path === file} title={row.path} onClick={() => setSelection({ scope: key, path: row.path })}>{row.path.split('/').slice(-2).join('/')}</button>)}
      </div>
      {shown && <pre className="sf-lt-source" aria-label={`Source of ${shown.path}`}>{shown.truncated ? 'This file is larger than 256 KB. Open it in your editor to read it.' : shown.content}</pre>}
    </div>}
  </section>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Shapes } from 'lucide-react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import type { AgentAction } from '../../lib/agent-action-model.js';
import { STUDIO_RPC, type LightningTypeSummary } from '../../lib/studio-contract.js';
import { LightningTypeView } from './studio/LightningTypeView.js';
import { LwcBundleView } from './studio/LwcBundleView.js';
import { AgentReferenceRow, AgentReferenceSearch } from './AgentReferenceList.js';

export interface OpenAgentType { ref: string; seq: number; fromAction: boolean }
type Location = { kind: 'type' | 'component'; ref: string };
const EMPTY: LightningTypeSummary[] = [];
const countLabel = (n: number, label: string) => `${n} ${label}${n === 1 ? '' : 's'}`;

/** Only the current draft's AST declarations are catalogued. Source readers remain project-scoped Studio RPCs. */
export function AgentTypesView({ pluginId, projectId, actions, loading, error, request, onOpenAction, onReturnToAction }: {
  pluginId: string; projectId?: string; actions: AgentAction[]; loading: boolean; error: string | null;
  request: OpenAgentType | null; onOpenAction(id: string): void; onReturnToAction(): void;
}) {
  const refs = [...new Set(actions.flatMap(a => [...a.inputs, ...a.outputs].flatMap(p => p.lightningType ? [p.lightningType] : [])))];
  const refsKey = JSON.stringify(refs);
  const [refresh, setRefresh] = useState(0);
  const key = JSON.stringify([pluginId, projectId, refsKey, refresh]);
  const [load, setLoad] = useState<{ key: string; types?: LightningTypeSummary[]; error?: string; truncated?: boolean } | null>(null);
  const [section, setSection] = useState<'types' | 'components'>('types');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<Location[]>([]);
  const [fromAction, setFromAction] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const openedFrom = useRef<string | null>(null);
  const listScroll = useRef(0);
  useEffect(() => {
    if (!request) return;
    setSection('types'); setHistory([{ kind: 'type', ref: request.ref }]); setFromAction(request.fromAction);
  }, [request]);
  useEffect(() => {
    if (!projectId || !refs.length || loading || error) return;
    let live = true;
    void Promise.resolve(callPluginRpc(pluginId, STUDIO_RPC.agentTypes, { projectId, refs: refs.slice(0, 120) })).then(value => {
      const out = value as { ok?: boolean; types?: LightningTypeSummary[]; truncated?: boolean; error?: string } | null;
      if (!live) return;
      setLoad(out?.ok && Array.isArray(out.types) ? { key, types: out.types, truncated: out.truncated } : { key, error: out?.error || 'The Lightning Types could not be read.' });
    }).catch(err => { if (live) setLoad({ key, error: err instanceof Error ? err.message : String(err) }); });
    return () => { live = false; };
  }, [key, loading, error]); // `key` includes plugin, project, refs and refresh.
  const current = load?.key === key ? load : null;
  const types = current?.types ?? EMPTY;
  const components = useMemo(() => {
    const rows = new Map<string, { ref: string; path?: string; via: string[] }>();
    for (const type of types) for (const component of type.components) {
      const row = rows.get(component.ref) ?? { ref: component.ref, path: component.path, via: [] };
      if (!row.via.includes(type.ref)) row.via.push(type.ref);
      rows.set(row.ref, row);
    }
    return [...rows.values()].sort((a, b) => a.ref.localeCompare(b.ref));
  }, [types]);
  const selected = history.at(-1);
  useEffect(() => {
    if (selected) { heading.current?.focus({ preventScroll: true }); if (root.current) root.current.scrollTop = 0; }
    else {
      const row = [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-ref]') ?? [])].find(row => row.dataset.ref === openedFrom.current);
      row?.focus({ preventScroll: true });
      if (root.current) root.current.scrollTop = listScroll.current;
    }
  }, [selected?.kind, selected?.ref]);
  const open = (next: Location) => setHistory(prev => [...prev, next]);
  const usedBy = (ref: string) => actions.filter(a => [...a.inputs, ...a.outputs].some(p => p.lightningType === ref));
  const issue = error || current?.error;
  const pending = loading || Boolean(projectId && refs.length && !current && !error);
  const matching = (values: string[]) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const filteredTypes = types.filter(t => matching([t.ref, t.title ?? '', ...t.components.map(c => c.ref)]));
  const filteredComponents = components.filter(c => matching([c.ref, ...c.via]));
  const component = selected?.kind === 'component' ? components.find(c => c.ref === selected.ref) : undefined;
  const referenced = !selected || (selected.kind === 'type' ? refs.includes(selected.ref) : Boolean(component) || history.some(row => row.kind === 'type' && refs.includes(row.ref)));

  const openRow = (kind: Location['kind'], ref: string) => {
    openedFrom.current = ref; listScroll.current = root.current?.scrollTop ?? 0;
    setFromAction(false); open({ kind, ref });
  };
  return <div className="sf-atp-types" data-testid="atp-types" ref={root}>
    {selected ? <>
      <div className="sf-atp-types-back" ref={heading} tabIndex={-1}>
        <button className="sf-atp-link" type="button" onClick={() => {
          if (history.length > 1) setHistory(prev => prev.slice(0, -1));
          else if (fromAction) onReturnToAction();
          else setHistory([]);
        }}>← {history.length > 1 ? 'Back' : fromAction ? 'Back to action' : section === 'types' ? 'All Lightning Types' : 'All components'}</button>
        <button className="sf-atp-link" type="button" onClick={() => { setHistory([]); setFromAction(false); }}>Browse all</button>
      </div>
      {pending ? <p className="sf-atp-empty" role="status">Loading types…</p> : issue ? <p className="sf-atp-empty sf-atp-error" role="alert">{issue}</p> : !referenced ? <p className="sf-atp-empty">This reference is no longer used by the current draft.</p> : selected.kind === 'type' ? <>
        <LightningTypeView key={`${selected.ref}:${refresh}`} pluginId={pluginId} projectId={projectId} typeRef={selected.ref} onOpenAgent={() => undefined} onOpenComponent={ref => open({ kind: 'component', ref })} />
        <section className="sf-atp-types-usage" aria-label="Used by actions"><h3>Used by actions</h3><div>{usedBy(selected.ref).map(a => <button key={a.id} className="sf-lt-chip" type="button" title={a.owner} onClick={() => onOpenAction(a.id)}>{a.name} ↗</button>)}</div></section>
      </> : <LwcBundleView key={`${selected.ref}:${refresh}`} pluginId={pluginId} projectId={projectId} componentRef={selected.ref} via={component?.via} onOpenAgent={() => undefined} onOpenType={ref => open({ kind: 'type', ref })} />}
    </> : <>
      <div className="sf-reference-head"><h2>Types</h2><button className="sf-atp-btn" type="button" disabled={pending || !projectId} onClick={() => setRefresh(n => n + 1)}>Refresh</button></div>
      <div className="sf-atp-types-sections" role="group" aria-label="Reference sections">
        <button type="button" aria-pressed={section === 'types'} onClick={() => { setSection('types'); setQuery(''); }}><Shapes size={14} aria-hidden="true" />Lightning Types <span>{types.length}</span></button>
        <button type="button" aria-pressed={section === 'components'} onClick={() => { setSection('components'); setQuery(''); }}><Boxes size={14} aria-hidden="true" />Components <span>{components.length}</span></button>
      </div>
      <p className="sf-reference-note">Referenced by this agent’s current draft</p>
      <AgentReferenceSearch label="Search types and components" placeholder={section === 'types' ? 'Search types or components…' : 'Search components…'} value={query} onChange={setQuery} />
      {!projectId ? <p className="sf-atp-empty">Open this agent in a project to browse its types.</p> : pending ? <p className="sf-atp-empty" role="status">Loading types…</p> : issue ? <p className="sf-atp-empty sf-atp-error" role="alert">{issue}</p> : <>
        {current?.truncated && <p className="sf-atp-types-note" role="status">Showing the first 60 types. Open an action’s type link to inspect other references.</p>}
        {!refs.length ? <p className="sf-atp-empty">No Lightning Types are declared by this agent’s actions.</p> : section === 'types' ? <>
          {([false, true] as const).map(standard => {
            const group = filteredTypes.filter(t => t.standard === standard);
            return group.length > 0 && <section className="sf-atp-types-group" key={String(standard)}><h3 className="sf-reference-group-label">{standard ? 'Standard' : 'Custom'} types <span>{group.length}</span></h3>{group.map(t => <AgentReferenceRow className="sf-atp-type-row" key={t.ref} data-ref={t.ref} kind="type" icon={<Shapes size={16} />} name={t.title || t.ref} reference={t.ref} meta={t.standard ? 'Standard' : t.status === 'missing' ? 'Not in project' : countLabel(new Set(t.components.map(c => c.ref)).size, 'component')} onClick={() => openRow('type', t.ref)} />)}</section>;
          })}
          {!filteredTypes.length && <p className="sf-atp-empty">No matching types.</p>}
        </> : <>
          {filteredComponents.map(c => <AgentReferenceRow className="sf-atp-type-row" key={c.ref} data-ref={c.ref} kind="component" icon={<Boxes size={16} />} name={c.ref.split('/').pop()!} reference={c.ref} meta={c.path ? countLabel(c.via.length, 'type') : 'Not in project'} onClick={() => openRow('component', c.ref)} />)}
          {!filteredComponents.length && <p className="sf-atp-empty">{components.length ? 'No matching components.' : 'No renderer or editor components are linked to these types.'}</p>}
        </>}
      </>}
    </>}
  </div>;
}

export const AGENT_TYPES_STYLES = `
.sf-atp-types { padding:12px; min-width:0; min-height:0; flex:1; overflow:auto; container-type:inline-size; }
.sf-atp-types-sections { display:flex; flex-wrap:wrap; gap:4px; }
.sf-atp-types-sections button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--sf-border); border-radius:6px; padding:6px 9px; background:transparent; color:var(--sf-muted); font:inherit; cursor:pointer; }
.sf-atp-types-sections button[aria-pressed=true] { border-color:var(--sf-accent); color:var(--sf-accent); background:var(--sf-soft); }
.sf-atp-types-sections button span { font-size:10px; opacity:.8; }
.sf-atp-types-note { font-size:11px; color:var(--sf-muted); margin:12px 0; }
.sf-atp-types-back { display:flex; justify-content:space-between; gap:12px; padding-bottom:12px; }
.sf-atp-types .sf-lt { overflow:visible; }
.sf-atp-types .sf-lt-head h2, .sf-atp-types .sf-lt-meta code, .sf-atp-types .sf-lt-note code { overflow-wrap:anywhere; min-width:0; }
.sf-atp-types .sf-lt-table { table-layout:fixed; width:100%; }
.sf-atp-types .sf-lt-table td, .sf-atp-types .sf-lt-table th, .sf-atp-types .sf-lt-table button { overflow-wrap:anywhere; }
.sf-atp-types .sf-lt-head, .sf-atp-types .sf-lt-section, .sf-atp-types .sf-lt-rel { padding-left:0; padding-right:0; }
.sf-atp-types-usage { border-top:1px solid var(--sf-border); padding:12px 0; }
.sf-atp-types-usage h3 { font-size:11px; color:var(--sf-muted); margin:0 0 8px; }
.sf-atp-types-usage > div { display:flex; gap:5px; flex-wrap:wrap; }
.sf-atp-types button:not(.sf-reference-row):focus-visible { outline:2px solid var(--sf-accent); outline-offset:2px; }
`;

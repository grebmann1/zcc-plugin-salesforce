import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Braces, ExternalLink, Info, PanelRight, Shapes, Workflow } from 'lucide-react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import { parseActionTarget, type AgentAction, type ActionParameter } from '../../lib/agent-action-model.js';
import type { ActionSource } from '../../lib/action-source.js';
import type { PublicOrgView } from '../../lib/types.js';
import { ActionCodePreview } from './ActionCodePreview.js';
import { useReferenceRefresh } from './studio/useReferenceRefresh.js';
import { FlowVisualization } from './FlowVisualization.js';
import { flowFromXml, flowModel, flowRunModeLabel, flowSignature, flowTouches, flowTypeLabel, type FlowTouches } from './action-flow.js';
import { LoadingState } from './components/SalesforceState.js';
import { AgentReferenceRow, AgentReferenceSearch } from './AgentReferenceList.js';
import { RefreshButton } from './components/RefreshButton.js';

export function AgentActionExplorer({ actions, selected, onOpen }: { actions: AgentAction[]; selected?: string; onOpen(action: AgentAction): void }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const search = query.trim().toLowerCase();
  const visible = actions.filter(action => [action.name, action.label, action.owner, action.target, action.description].join(' ').toLowerCase().includes(search));
  const groups = [...new Set(visible.map(action => action.owner))];
  return <section className="sf-as-section af-action-explorer" aria-label="Agent actions">
    <div className="sf-reference-head"><h2>Actions <span className="sf-reference-count">{search ? `${visible.length} / ${actions.length}` : actions.length}</span></h2></div>
    <p className="sf-reference-note">Declared in this agent’s current draft</p>
    <AgentReferenceSearch label="Search actions" placeholder="Search actions or targets…" value={query} onChange={setQuery} />
    {!actions.length && <p className="sf-as-empty">Actions declared in this script appear here.</p>}
    {Boolean(actions.length && !visible.length) && <p className="sf-as-empty" role="status">No matching actions.</p>}
    {groups.map(owner => {
      const rows = visible.filter(a => a.owner === owner);
      // The click records the choice synchronously: a search can remount the group before an async toggle event lands.
      return <details key={`${owner}:${Boolean(search)}`} open={Boolean(search) || !collapsed.has(owner)}><summary className="sf-reference-group-label" title={owner} onClick={e => {
        if (search) return;
        e.preventDefault();
        setCollapsed(prev => { const next = new Set(prev); if (next.has(owner)) next.delete(owner); else next.add(owner); return next; });
      }}>{owner.replace(/^(start_agent|subagent|topic)\./, '')}<span>{rows.length}</span></summary>{rows.map(action => {
        const kind = parseActionTarget(action.target)?.kind ?? 'action';
        const label = action.label && action.label !== action.name ? `${action.label} (${action.name})` : action.name;
        return <AgentReferenceRow key={action.id} kind={kind} icon={kind === 'apex' ? <Braces size={16} /> : kind === 'flow' ? <Workflow size={16} /> : <ExternalLink size={16} />} name={action.label || action.name} reference={action.target || action.name} meta={kind === 'apex' ? 'Apex' : kind === 'flow' ? 'Flow' : 'Action'} active={selected === action.id} title={`${action.owner} · ${action.name} · ${action.target || 'No target'}`} aria-label={`Inspect ${label} in ${action.owner}`} onClick={() => onOpen(action)} />;
      })}</details>;
    })}
  </section>;
}

export type ContractStatus = 'matched' | 'not-declared' | 'missing' | 'unverified';
export interface ContractRow { name: string; declared?: ActionParameter; actual?: ActionParameter; status: ContractStatus }

/** One row per parameter name on either side. `actual` is undefined until a contract has been read. */
export function contractRows(declared: ActionParameter[], actual?: ActionParameter[]): ContractRow[] {
  const names = [...new Set([...declared.map(p => p.name), ...(actual ?? []).map(p => p.name)])];
  return names.map(name => {
    const script = declared.find(p => p.name === name), target = actual?.find(p => p.name === name);
    const status: ContractStatus = actual === undefined ? 'unverified' : script && target ? 'matched' : target ? 'not-declared' : 'missing';
    return { name, ...(script ? { declared: script } : {}), ...(target ? { actual: target } : {}), status };
  });
}
const isMismatch = (row: ContractRow) => row.status === 'not-declared' || row.status === 'missing';

function Parameters({ title, rows, verified, contractLabel, compare = true, onOpenType }: { title: string; rows: ContractRow[]; verified: boolean; contractLabel: string; compare?: boolean; onOpenType?(ref: string): void }) {
  // Without an agent declaration (a dependency tab) there is nothing to compare: list what the implementation exposes.
  if (!compare) return <section className="af-action-parameters"><h3>{title}</h3>{!rows.length ? <p className="af-action-note">{verified ? 'No parameters.' : 'Unverified.'}</p> : <table><thead><tr><th>Parameter</th><th>{contractLabel}</th></tr></thead><tbody>{rows.map(({ name, actual }) =>
    <tr key={name}><th scope="row"><code>{name}</code><small>{actual?.description}</small></th><td><code>{actual?.type}</code>{actual?.required && <small>Required</small>}</td></tr>)}</tbody></table>}</section>;
  return <section className="af-action-parameters"><h3>{title}</h3>{!rows.length ? <p className="af-action-note">{verified ? 'No parameters.' : 'No parameters declared in this action.'}</p> : <table><thead><tr><th>Parameter</th><th>Agent definition</th><th>{contractLabel}</th></tr></thead><tbody>{rows.map(({ name, declared: script, actual: target, status }) => {
    return <tr key={name}><th scope="row"><code>{name}</code><small>{script?.description || target?.description}</small></th><td>{script ? <><code>{script.type}</code>{script.lightningType && <div className="af-action-type">{onOpenType ? <button type="button" className="af-text-button" onClick={() => onOpenType(script.lightningType!)}><Shapes size={12} aria-hidden="true" />{script.lightningType} ↗</button> : <code>{script.lightningType}</code>}</div>}{script.required && <small>Required</small>}</> : <span className="af-action-warning">Not declared</span>}</td><td>{status === 'unverified' ? <span className="af-action-note">Unverified</span> : target ? <><code>{target.type}</code><small>{target.required ? 'Required · ' : ''}{script ? 'Name matched' : 'Not mapped in agent'}</small></> : <span className="af-action-warning">Missing in target</span>}</td></tr>;
  })}</tbody></table>}</section>;
}

const RAIL_STATUS: Record<ContractStatus, [string, string]> = {
  matched: ['is-ok', '✓ Matches the agent'], 'not-declared': ['is-warn', '⚠ Not declared in the agent'], missing: ['is-warn', '⚠ Missing in the Flow'], unverified: ['', 'Unverified']
};

/** The Map tab's side rail: the variable contract next to the logic, and what the Flow touches. */
function FlowRail({ inputs, outputs, compare, touches, runMode, onOpenTarget }: {
  inputs: ContractRow[]; outputs: ContractRow[]; compare: boolean; touches: FlowTouches; runMode?: string; onOpenTarget(target: string): void;
}) {
  const section = (title: string, rows: ContractRow[]) => <div className="af-flow-rail-section"><h3>{title} <span>{rows.length}</span></h3>
    {!rows.length ? <p className="af-action-note">None.</p> : rows.map(row => {
      const [tone, text] = RAIL_STATUS[row.status];
      const param = row.actual ?? row.declared;
      return <div className="af-flow-rail-param" key={row.name}><code>{row.name}</code><span>{param?.type}{param?.required ? ' · required' : ''}</span>{compare && <small className={tone}>{text}</small>}</div>;
    })}</div>;
  return <aside className="af-flow-rail" aria-label="Flow contract">
    {section('Inputs', inputs)}
    {section('Outputs', outputs)}
    <div className="af-flow-rail-section"><h3>Touches</h3><dl>
      <dt>Reads</dt><dd>{touches.reads.join(', ') || '—'}</dd>
      <dt>Writes</dt><dd>{touches.writes.join(', ') || 'Nothing'}</dd>
      <dt>Calls</dt><dd>{touches.calls.length ? touches.calls.map(call => call.target ? <button key={call.label} className="af-target-link" onClick={() => onOpenTarget(call.target!)}>{call.label} ↗</button> : <span key={call.label}>{call.label}</span>) : '—'}</dd>
      {runMode && <><dt>Runs in</dt><dd>{runMode}</dd></>}
    </dl></div>
  </aside>;
}

type ActionTab = 'implementation' | 'source' | 'parameters' | 'usage';

/** One row of tabs: a Flow gets Map and Source, Apex its source. Contract only when there is one to compare, Used by only for actions declared in the script. */
export function actionTabs(action: AgentAction, kind: 'apex' | 'flow' | undefined): [ActionTab, string][] {
  const tabs: [ActionTab, string][] = kind === 'flow' ? [['implementation', 'Map'], ['source', 'Source']] : [['implementation', kind === 'apex' ? 'Source' : 'Implementation']];
  if (kind === 'flow' || action.inputs.length || action.outputs.length) tabs.push(['parameters', 'Contract']);
  if (!action.id.startsWith('dependency:')) tabs.push(['usage', 'Used by']);
  return tabs;
}

const normalizeSource = (content: string) => content.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim();
function parsedFlow(data: ActionSource) { return flowModel(data.flow ?? flowFromXml(data.content ?? '')); }

/** Visualization objects are derived from source and must not make every local probe look changed. */
export function sourceFingerprint(source: ActionSource | undefined): string {
  if (!source) return '';
  const { visualization: _visualization, visualizationError: _visualizationError, ...snapshot } = source;
  return JSON.stringify(snapshot);
}

/** Whether the project copy and the org copy agree. Flows compare structure (the two sides use different formats), Apex compares text. */
export function sourceDrift(kind: 'apex' | 'flow', project?: ActionSource, orgSource?: ActionSource): 'same' | 'differs' | undefined {
  if (project?.status !== 'ready' || orgSource?.status !== 'ready') return undefined;
  try {
    if (kind === 'flow') return flowSignature(parsedFlow(project)) === flowSignature(parsedFlow(orgSource)) ? 'same' : 'differs';
    if (project.content === undefined || orgSource.content === undefined) return undefined;
    return normalizeSource(project.content) === normalizeSource(orgSource.content) ? 'same' : 'differs';
  } catch { return undefined; }
}

/** The agent a dependency tab was reached from; the header links back to it. */
export interface ActionContext { label: string; title?: string; onOpen(): void }

export function AgentActionPanel({ pluginId, projectId, action, org, context, onReveal, onOpenTarget, onOpenType, onOriginChange, initialOrigin = 'project' }: {
  pluginId: string; projectId?: string; action: AgentAction; org: PublicOrgView | null; context?: ActionContext;
  initialOrigin?: 'project' | 'org'; onOriginChange?(origin: 'project' | 'org'): void; onReveal(line: number): void; onOpenTarget(target: string, origin: 'project' | 'org'): void; onOpenType?(ref: string): void;
}) {
  const [origin, setOrigin] = useState(initialOrigin);
  useEffect(() => setOrigin(initialOrigin), [initialOrigin]);
  const chooseOrigin = (next: 'project' | 'org') => { setOrigin(next); setCandidate(''); onOriginChange?.(next); };
  const [chosenTab, setTab] = useState<ActionTab>('implementation');
  const [rail, setRail] = useState(false);
  const [candidate, setCandidate] = useState('');
  useEffect(() => setCandidate(''), [action.target]);
  const [driftReload, setDriftReload] = useState(0);
  const root = useRef<HTMLElement>(null);
  const [other, setOther] = useState<{ key: string; data?: ActionSource }>({ key: '' });
  const parsed = parseActionTarget(action.target);
  const dependency = action.id.startsWith('dependency:');
  const tabs = actionTabs(action, parsed?.kind);
  const tab = tabs.some(([id]) => id === chosenTab) ? chosenTab : 'implementation';
  const key = JSON.stringify([pluginId, projectId, action.target, origin, org?.orgId, org?.alias, candidate]);
  const orgArgs = () => ({ orgAlias: org!.alias || org!.username });
  const { data, error, busy, refresh, revision } = useReferenceRefresh<ActionSource>({
    scope: key, projectId, element: root, automatic: origin === 'project',
    enabled: Boolean(parsed) && (origin === 'project' || Boolean(org)),
    paths: data => data?.status === 'ready' && data.origin === 'project' ? [data.label] : [],
    read: async ({ reason, previous, isCurrent }) => {
      const args = { projectId, target: action.target, origin, ...(origin === 'org' ? orgArgs() : {}), ...(candidate && origin === 'project' ? { candidate } : {}) };
      const fetch = async (visualize: boolean) => {
        const result = await callPluginRpc(pluginId, 'agentActions.source', { ...args, ...(visualize ? { visualize: true } : {}) }) as { ok?: boolean; data?: ActionSource; error?: string } | null;
        if (!result?.ok || !result.data) throw Error(result?.error || 'Could not load this implementation.');
        return result.data;
      };
      const isFlow = parsed?.kind === 'flow';
      // Background checks read cheap local XML first. The official viewer is rebuilt only for changed source.
      if (reason !== 'initial' && reason !== 'manual') {
        const next = await fetch(false);
        if (sourceFingerprint(next) === sourceFingerprint(previous)) return previous!;
        if (!isCurrent() || !isFlow || next.status !== 'ready') return next;
      }
      return fetch(isFlow);
    },
  });
  const refreshImplementation = () => { refresh(); setDriftReload(value => value + 1); };
  // Drift needs the other side too: read it once the shown side is ready. A failure only means no drift signal.
  const ready = data?.status === 'ready';
  useEffect(() => {
    if (!ready || !org || !parseActionTarget(action.target)) return;
    let cancelled = false;
    const otherOrigin = origin === 'project' ? 'org' : 'project';
    void Promise.resolve(callPluginRpc(pluginId, 'agentActions.source', { projectId, target: action.target, origin: otherOrigin, ...(otherOrigin === 'org' ? orgArgs() : {}) })).then(value => {
      const result = value as { ok?: boolean; data?: ActionSource } | null;
      if (!cancelled) setOther({ key, ...(result?.ok && result.data ? { data: result.data } : {}) });
    }).catch(() => { if (!cancelled) setOther({ key }); });
    return () => { cancelled = true; };
  }, [key, pluginId, ready, driftReload]);
  const otherData = other.key === key ? other.data : undefined;
  const drift = parsed ? sourceDrift(parsed.kind, origin === 'project' ? data : otherData, origin === 'org' ? data : otherData) : undefined;
  const orgVersion = (origin === 'org' ? data : otherData)?.version;
  const flow = useMemo(() => {
    if (!data || parsed?.kind !== 'flow' || data.status !== 'ready') return undefined;
    try { return { model: parsedFlow(data) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [data, parsed?.kind]);
  const touches = useMemo(() => flow?.model ? flowTouches(flow.model) : undefined, [flow?.model]);
  const actualInputs = data?.inputs ?? flow?.model?.inputs;
  const actualOutputs = data?.outputs ?? flow?.model?.outputs;
  const inputRows = contractRows(action.inputs, actualInputs), outputRows = contractRows(action.outputs, actualOutputs);
  // A dependency tab has no agent declaration, so every parameter would read as undeclared.
  const mismatches = dependency ? 0 : [...inputRows, ...outputRows].filter(isMismatch).length;
  const typeLabel = parsed?.kind === 'apex' ? 'Apex class' : flowTypeLabel(flow?.model?.meta);
  const status = !ready ? undefined : origin === 'org' ? `${parsed?.kind === 'flow' ? data?.inactive ? 'Inactive' : 'Active' : 'Deployed'}${data?.version != null ? ` · v${data.version}` : ''}` : flow?.model?.meta?.status;
  const sourceNote = origin === 'project' ? 'Local snapshot · may differ from deployed source' : 'Org snapshot · use Refresh to check for deployed changes';
  const driftTitle = drift === 'differs' ? `Project copy differs from the org${orgVersion != null ? ` (v${orgVersion})` : ''}${parsed?.kind === 'flow' ? ': elements, connectors or variables changed' : ''}` : drift === 'same' ? `Project copy matches the org${orgVersion != null ? ` (v${orgVersion})` : ''}` : sourceNote;
  const owner = context ? <button type="button" className="af-backlink" title={context.title} onClick={context.onOpen}>← {context.label}</button> : action.owner ? <span>{action.owner}</span> : null;
  const loadState = (view: (data: ActionSource) => ReactNode) => !parsed ? <p className="af-action-note">This target type has no implementation viewer yet. Its action definition and usage remain available.</p> : origin === 'org' && !org ? <p className="af-action-note">Connect an org to inspect its deployed implementation.</p> : !data && busy ? <LoadingState compact art="code" label="Loading implementation…" /> : <>
    {error && <p role="alert" className="af-action-note">{error}</p>}
    {data?.message && !ready && <p className="af-action-note">{data.message}</p>}
    {data?.candidates?.map(path => <button key={path} className="af-source-candidate" onClick={() => setCandidate(path)}>{path} →</button>)}
    {data?.status === 'ready' && view(data)}
  </>;
  const flowMap = (data: ActionSource) => flow?.model ? <div className={`af-flow-split${rail ? ' has-rail' : ''}`}>
    <FlowVisualization key={`${key}:${revision}`} pluginId={pluginId} visualization={data.visualization} error={data.visualizationError} sourceLabel={`${data.label}${data.version != null ? ` · v${data.version}` : ''}`} model={flow.model} onOpenTarget={target => onOpenTarget(target, origin)} />
    {rail && touches && <FlowRail inputs={inputRows} outputs={outputRows} compare={!dependency} touches={touches} runMode={flowRunModeLabel(flow.model.meta)} onOpenTarget={target => onOpenTarget(target, origin)} />}
  </div> : <p className="af-action-note" role="alert">{flow?.error}</p>;
  const code = (data: ActionSource) => <ActionCodePreview content={data.content ?? ''} language={data.language ?? 'apex'} />;
  return <section ref={root} className="af-action-panel" data-testid="agent-action-panel" aria-label={`Action ${action.name}`}>
    <header className="af-action-heading">
      <div className="af-action-title">
        <span className={`af-action-icon ${parsed?.kind ?? ''}`} aria-hidden="true">{parsed?.kind === 'apex' ? '{ }' : '⑂'}</span>
        <div className="af-action-name"><h2 title={action.target || undefined}>{parsed?.developerName ?? action.name}</h2>
          {typeLabel && <span className="af-chip">{typeLabel}</span>}
          {status && <span className={`af-chip${/^Active|^Deployed/.test(status) ? ' is-ok' : ''}`}>{status}</span>}
          <span className="af-chip">Read only</span>
        </div>
        <div className="af-action-sourcebar"><div role="group" aria-label="Implementation source" title={sourceNote}>
          <button aria-pressed={origin === 'project'} title={driftTitle} onClick={() => chooseOrigin('project')}>Project{drift === 'differs' && <span className="af-drift" role="img" aria-label="differs from org" />}</button>
          <button aria-pressed={origin === 'org'} disabled={!org} onClick={() => chooseOrigin('org')}>Org{org ? ` · ${org.alias || org.username}` : ''}</button>
        </div><RefreshButton label="Refresh implementation" busy={busy} onClick={refreshImplementation} /></div>
      </div>
      <div className="af-action-glance">
        {owner}
        {!action.target && <span>No implementation target declared</span>}
        {origin === 'project' && ready && data?.label && <code title={sourceNote}>{data.label}</code>}
        {ready && data?.message && <details className="af-source-info"><summary aria-label="Source information" title="Source information"><Info size={13} aria-hidden="true" /></summary><p>{data.message}</p></details>}
        {touches && <span>Reads <b>{touches.reads.join(', ') || 'nothing'}</b></span>}
        {touches && <span>Writes <b>{touches.writes.join(', ') || 'nothing'}</b></span>}
        {touches && touches.calls.length > 0 && <span><b>{touches.calls.length}</b> {touches.calls.length === 1 ? 'call' : 'calls'}</span>}
      </div>
      {action.description && <p>{action.description}</p>}
    </header>
    {tabs.length > 1 && <nav className="af-action-nav" aria-label="Action details">
      {tabs.map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}
        {id === 'parameters' && mismatches > 0 && <span className="af-tab-count is-warn" aria-label={`${mismatches} ${mismatches === 1 ? 'mismatch' : 'mismatches'}`}>{mismatches}</span>}
        {id === 'usage' && action.uses.length > 0 && <span className="af-tab-count">{action.uses.length}</span>}
      </button>)}
      {tab === 'implementation' && flow?.model && <div className="af-action-tools"><button aria-pressed={rail} aria-label={rail ? 'Hide contract panel' : 'Show contract panel'} title="Inputs, outputs and what this Flow touches" onClick={() => setRail(value => !value)}><PanelRight size={14} aria-hidden="true" /></button></div>}
    </nav>}
    <div className={`af-action-content${tab === 'implementation' || tab === 'source' ? ' is-implementation' : ''}`}>
      {tab === 'implementation' && loadState(parsed?.kind === 'flow' ? flowMap : code)}
      {tab === 'source' && loadState(code)}
      {tab === 'parameters' && <><p className="af-action-note">{dependency ? `Inputs and outputs ${origin === 'project' ? 'this project’s implementation' : 'the selected org’s registered contract'} exposes. Open an action in the agent to compare them with its declarations.` : `Compare action declarations with ${origin === 'project' ? 'this project’s implementation' : 'the selected org’s registered contract'}. Name matches do not verify type compatibility or runtime behavior.`}</p>{data?.contractMessage && <p className="af-action-note">{data.contractMessage}</p>}{error && <p role="alert" className="af-action-note">{error}</p>}<Parameters onOpenType={onOpenType} title="Inputs" rows={inputRows} verified={actualInputs !== undefined} compare={!dependency} contractLabel={origin === 'project' ? 'Project implementation' : 'Org contract'} /><Parameters onOpenType={onOpenType} title="Outputs" rows={outputRows} verified={actualOutputs !== undefined} compare={!dependency} contractLabel={origin === 'project' ? 'Project implementation' : 'Org contract'} /></>}
      {tab === 'usage' && <><p className="af-action-note">Static references in the current editor draft. Availability does not mean the action executed.</p><button className="af-target-link" onClick={() => onReveal(action.line)}>Go to action definition · line {action.line} ↗</button>{action.uses.length ? action.uses.map((use, i) => <article className="af-action-use" key={i}><button onClick={() => onReveal(use.line)}>{use.kind === 'run' ? 'Explicit run' : 'Available to the model'} <span>Line {use.line} ↗</span></button><pre>{use.code}</pre></article>) : <p className="af-action-note">No direct calls or model bindings found in this scope.</p>}</>}
    </div>
  </section>;
}

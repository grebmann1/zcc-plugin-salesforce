import { useToolWorkspaceState } from './tool-workspace-state.js';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { RefreshCw, Plus, Download } from 'lucide-react';
import { PopoverPicklist } from '@zana-ai/zcc-ui/popover-picklist';
import { callPluginRpc, useRealtime } from '@zana-ai/zcc-plugin-sdk/app';
import { BUILDER_RPC, BUILDER_LIMITS, emptyBuilderResources, parseToolManifest, scoreEvidence, type BuilderTool, type BuilderResources, type BuilderScorer } from '../../../lib/studio-builder-contract.js';
import { STUDIO_CHANGED_CHANNEL, STUDIO_RPC, type ScenarioCase, type ScenarioSuite, type StudioDiagnostic, type SuiteComparison } from '../../../lib/studio-contract.js';
import type { LabSnapshot } from '../../../lib/agentforce-lab-contract.js';
import { lineDiff, foldDiff, diffStats, comparableText } from '../../../lib/line-diff.js';
import { savedEvidence, evidenceSummary, sessionMode, sessionTitle, sessionSearchText } from './builder-evidence.js';
import { SuiteComparisonView } from './SuiteComparisonView.js';
import { runSuiteJob } from './suite-job-rpc.js';
import { BUILDER_TOOL_CATALOG } from './builder-tool-catalog.js';
import type { AgentScriptTool } from '../AgentScriptTools.js';
import { StudioToolHeader } from './StudioToolHeader.js';
import { readComparisonHandle, writeComparisonHandle, forgetComparisonHandle } from './comparison-recovery.js';

export interface EditorPreferences { lines: boolean; wrap: boolean }
export interface BuilderToolsProps {
  /** Window-local drafts for independently mounted thread tabs. */
  workspaceKey?: string;
  tool: BuilderTool; pluginId: string; projectId?: string; threadId?: string; path: string | null;
  source: string; savedSource: string | null; diagnostics: StudioDiagnostic[]; visible: boolean;
  preferences: EditorPreferences; onPreferences(value: EditorPreferences): void; share: boolean; onShare(value: boolean): void;
  /** Thread tools have no Studio context-sharing switch; the owning conversation supplies its context. */
  contextSharing?: boolean;
  onOpenTool(tool: AgentScriptTool): void; onAskAgent(prompt: string): void; onReveal(line: number): void; onReplay(runId: string, agentPath?: string): void;
}
type Reply = { ok?: boolean; error?: string; resources?: BuilderResources; suites?: ScenarioSuite[]; data?: LabSnapshot[] } & Record<string, unknown>;
const failure = (value: unknown) => value instanceof Error ? value.message : String(value);
const stamp = (at?: number) => at ? new Date(at).toLocaleString() : 'Time unavailable';
const id = () => crypto.randomUUID();

interface ComparisonRun {
  suiteId: string; suitePath: string; source: string; cases: string; setupKey: string; caseDefinitions: ScenarioCase[];
  input: Record<string, unknown>; status: 'running' | 'completed' | 'failed';
  started?: Promise<Reply>; jobId?: string; value?: SuiteComparison; error?: string;
  recovered?: boolean;
}
// Only handles started by this workspace are recoverable. The server's latest job
// is project-wide and has no agent/source provenance, so it is never adopted here.
// This cache survives panel/agent navigation; completed entries are bounded and
// never persist source text. Owned job handles can reconnect after a view reload.
const comparisonRuns = new Map<string, ComparisonRun>();
function rememberComparison(key: string, run: ComparisonRun) {
  if (!comparisonRuns.has(key) && comparisonRuns.size >= 32) {
    const oldest = [...comparisonRuns].find(([, value]) => value.status !== 'running');
    if (!oldest) return false;
    comparisonRuns.delete(oldest[0]);
  }
  comparisonRuns.delete(key); comparisonRuns.set(key, run); return true;
}
function isComparison(value: unknown): value is SuiteComparison {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const results = (entries: unknown) => Boolean(entries && typeof entries === 'object' && !Array.isArray(entries) && Object.values(entries).every(result => {
    if (!result || typeof result !== 'object') return false;
    const item = result as Record<string, unknown>;
    return ['pass', 'fail', 'inconclusive'].includes(String(item.outcome)) && typeof item.runId === 'string' && typeof item.at === 'number';
  }));
  return ['referenceHash', 'candidateHash', 'suiteHash'].every(key => typeof row[key] === 'string') && typeof row.at === 'number' && results(row.reference) && results(row.candidate);
}

function useBuilderData(props: BuilderToolsProps) {
  const { pluginId, projectId, path, visible, tool } = props;
  const needsResources = ['scorers', 'experiments', 'artifacts', 'import'].includes(tool);
  const needsSuites = !['settings', 'compare', 'import'].includes(tool);
  const needsSessions = tool === 'sessions';
  const [resources, setResources] = useState(emptyBuilderResources);
  const [suites, setSuites] = useState<ScenarioSuite[]>([]);
  const [sessions, setSessions] = useState<LabSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const sequence = useRef(0), alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  const rpc = useCallback(async (method: string, args: Record<string, unknown> = {}) => {
    const result = await callPluginRpc(pluginId, method, { projectId, ...args }) as Reply | null;
    if (!result || result.ok === false) throw Error(result?.error || 'No response from Studio.');
    return result;
  }, [pluginId, projectId]);
  const reload = useCallback(async () => {
    if (locked.current) return;
    const seq = ++sequence.current;
    if (!needsResources && !needsSuites && !needsSessions) return;
    if (!projectId) { setError('Choose a project to use this tool.'); return; }
    setLoading(true); setError(null);
    if (needsResources) setResourcesLoaded(false);
    const requests = [
      ...(needsResources ? [{ kind: 'resources', request: rpc(BUILDER_RPC.get) }] : []),
      ...(needsSuites ? [{ kind: 'suites', request: rpc(STUDIO_RPC.suites, path ? { agentPath: path } : {}) }] : []),
      ...(needsSessions ? [{ kind: 'sessions', request: rpc('agentLab.list', { includeClosed: true, summaryOnly: true, ...(path ? { path } : {}) }) }] : []),
    ];
    const replies = await Promise.allSettled(requests.map(row => row.request));
    if (!alive.current || seq !== sequence.current) return;
    replies.forEach((reply, index) => {
      if (reply.status !== 'fulfilled') return;
      if (requests[index].kind === 'resources' && reply.value.resources) { setResources(reply.value.resources); setResourcesLoaded(true); }
      if (requests[index].kind === 'suites' && reply.value.suites) setSuites(reply.value.suites);
      if (requests[index].kind === 'sessions' && Array.isArray(reply.value.data)) setSessions(reply.value.data);
    });
    const errors = replies.flatMap(reply => reply.status === 'rejected' ? [failure(reply.reason)] : []);
    setError(errors.length ? [...new Set(errors)].join(' · ') : null); setLoading(false);
  }, [path, projectId, rpc, needsResources, needsSuites, needsSessions]);
  useEffect(() => { if (visible) void reload(); }, [visible, reload]);
  useRealtime(STUDIO_CHANGED_CHANNEL, value => {
    const event = value as { projectId?: string; kind?: string } | null;
    if (visible && event && event.projectId === projectId && ((event.kind === 'builder' && needsResources) || (event.kind === 'suites' && needsSuites)) && !locked.current) void reload();
  });
  const save = async (next: BuilderResources) => {
    if (locked.current || !projectId || !resourcesLoaded) return false;
    locked.current = true; sequence.current++; setLoading(false); setSaving(true); setError(null);
    try {
      const reply = await rpc(BUILDER_RPC.save, { resources: next });
      if (!reply.resources) throw Error('Workspace save returned no resources.');
      if (alive.current) { sequence.current++; setResources(reply.resources); }
      return true;
    } catch (err) { if (alive.current) setError(failure(err)); return false; }
    finally { locked.current = false; if (alive.current) { setSaving(false); setLoading(false); } }
  };
  return { resources, suites, sessions, error, setError, loading, saving, canSave: resourcesLoaded && !loading && !saving, save, reload, rpc };
}

/** Real project evidence and bounded, project-owned authoring resources; never demo fixtures. */
export function BuilderTools(props: BuilderToolsProps) {
  const data = useBuilderData(props);
  const { tool, path, source, savedSource, diagnostics, onOpenTool, onAskAgent } = props;
  const rows = savedEvidence(data.suites);
  const [query, setQuery] = useToolWorkspaceState(props.workspaceKey, 'query', ''), [filter, setFilter] = useToolWorkspaceState(props.workspaceKey, 'filter', 'all'), [selected, setSelected] = useToolWorkspaceState<string | null>(props.workspaceKey, 'selected', null);
  const [creating, setCreating] = useToolWorkspaceState(props.workspaceKey, 'creating', false), [notice, setNotice] = useState('');
  const workspaceRoot = useRef<HTMLElement>(null);
  const previousWorkspace = useRef<{ key: string; selected: string | null } | null>(null);
  const [scorer, setScorer] = useToolWorkspaceState<BuilderScorer>(props.workspaceKey, 'scorer', { id: '', name: '', kind: 'contains', value: '' });
  const [artifact, setArtifact] = useToolWorkspaceState(props.workspaceKey, 'artifact', { id: '', name: '', content: '' });
  const [manifest, setManifest] = useToolWorkspaceState(props.workspaceKey, 'manifest', '{\n  "name": "Quality dashboard",\n  "description": "Review saved evaluation outcomes",\n  "tool": "analytics"\n}');
  const [range, setRange] = useToolWorkspaceState(props.workspaceKey, 'range', 'all'), [stopping, setStopping] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const replay = async (runId: string) => {
    if (replaying) return;
    setReplaying(true); data.setError(null);
    try {
      // A listed runtime may expire while its saved recording is being read.
      // Keep the transcript open rather than navigating into an expired replay.
      const reply = await data.rpc('agentLab.get', { id: runId });
      const run = reply.data as unknown as LabSnapshot | undefined;
      const owner = run?.path ?? data.sessions.find(row => row.id === runId)?.path ?? props.path;
      if (!owner) throw Error('This run has no agent file. Open an agent and start a new preview.');
      if (mounted.current) props.onReplay(runId, owner);
    } catch (error) { if (mounted.current) data.setError(failure(error)); }
    finally { if (mounted.current) setReplaying(false); }
  };
  const formId = useId();
  const comparisonKey = props.projectId && path ? JSON.stringify([props.pluginId, props.projectId, path]) : null;
  const retainedRun = useRef<ComparisonRun | undefined>((() => {
    if (!comparisonKey) return undefined;
    const cached = comparisonRuns.get(comparisonKey);
    if (cached) return cached;
    const handle = readComparisonHandle(comparisonKey);
    if (!handle) return undefined;
    const recovered: ComparisonRun = { ...handle, source: '', cases: '', setupKey: '', caseDefinitions: [], input: {}, status: 'running', recovered: true,
      started: Promise.resolve({ ok: true, jobId: handle.jobId }) };
    rememberComparison(comparisonKey, recovered);
    return recovered;
  })()).current;
  const [sideBySide, setSideBySide] = useToolWorkspaceState(props.workspaceKey, 'sideBySide', false), [suiteId, setSuiteId] = useToolWorkspaceState(props.workspaceKey, 'suiteId', retainedRun?.suiteId ?? '');
  const [comparison, setComparison] = useState<ComparisonRun | null>(retainedRun?.value ? retainedRun : null);
  const [job, setJob] = useState<string | null>(retainedRun?.status === 'running' ? retainedRun.jobId ?? null : null), [running, setRunning] = useState(retainedRun?.status === 'running');
  const suite = data.suites.find(row => row.id === suiteId) ?? data.suites[0];
  const setupKey = suite ? JSON.stringify([suite.id, suite.path, suite.cases]) : '';
  const [preparation, setPreparation] = useState({ key: '', ids: [] as string[] });
  const activeComparison = comparisonKey ? comparisonRuns.get(comparisonKey) : undefined;
  const prepared = running && activeComparison?.status === 'running' && activeComparison.setupKey === setupKey
    ? activeComparison.input.preparedCaseIds as string[]
    : preparation.key === setupKey ? preparation.ids : [];
  const unprepared = suite?.cases.some(row => row.prerequisites?.length && !prepared.includes(row.id));
  useEffect(() => { setPreparation({ key: setupKey, ids: [] }); }, [setupKey]);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const title = BUILDER_TOOL_CATALOG.find(row => row.id === tool)!;
  const matches = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const pill = (value: string) => <span className="sf-builder-pill" data-status={value}>{value}</span>;
  const empty = (message: string, action?: ReactNode, hint?: string) => <div className="sf-builder-empty" role="status"><h3>{message}</h3>{hint && <p>{hint}</p>}{action}</div>;
  const begin = () => { setNotice(''); data.setError(null); };
  const resetFilters = () => { setQuery(''); setFilter('all'); };
  const resultCount = (count: number, label: string) => <p className="sf-builder-result-count" role="status">{count} {label}{count === 1 ? '' : 's'}{query.trim() || filter !== 'all' ? ' match your filters' : ''}</p>;
  const saveArtifact = async (name: string, content: string) => {
    if (content.length > BUILDER_LIMITS.content) { data.setError('This report exceeds the 50000 character file limit.'); return false; }
    return data.save({ ...data.resources, artifacts: [...data.resources.artifacts, { id: id(), name, content }] });
  };
  const attachComparison = useCallback(async (run: ComparisonRun) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setRunning(true); setJob(run.jobId ?? null); data.setError(null);
    setNotice(run.started ? 'Reconnecting to this comparison…' : 'Running both sources against the same cases.');
    try {
      const reply = await runSuiteJob(async (method, args) => {
        if (method !== STUDIO_RPC.suiteStart) return data.rpc(method, args);
        // Share the original start request, even when navigation happens before
        // the server returns its handle. Reentry must never start a second job.
        run.started ??= data.rpc(method, args).then(started => {
          if (typeof started.jobId === 'string') {
            run.jobId = started.jobId;
            if (comparisonKey) writeComparisonHandle(comparisonKey, { jobId: started.jobId, suiteId: run.suiteId, suitePath: run.suitePath, at: Date.now() });
          }
          return started;
        });
        return run.started;
      }, run.input, abort.signal, value => {
        if (value) run.jobId = value;
        if (mounted.current && !abort.signal.aborted) setJob(value);
      });
      if (abort.signal.aborted) return;
      if (!isComparison(reply.comparison)) throw Error('The comparison returned no valid results.');
      const executedSuite = reply.suite as ScenarioSuite | undefined;
      // The server rereads the suite when starting. Preserve the definitions it
      // actually executed if another editor saved cases after our last refresh.
      if (executedSuite?.path === run.suitePath && Array.isArray(executedSuite.cases)) {
        run.suiteId = executedSuite.id; run.cases = JSON.stringify(executedSuite.cases); run.caseDefinitions = structuredClone(executedSuite.cases);
      }
      run.value = reply.comparison; run.status = 'completed';
      if (mounted.current) { setComparison({ ...run }); setNotice('Comparison complete. Review both responses below.'); }
    } catch (err) {
      if (abort.signal.aborted) return;
      run.status = 'failed'; run.error = err instanceof Error && err.name === 'SuiteStoppedError'
        ? 'Comparison stopped. Run it again to collect both results.' : failure(err);
      if (comparisonKey) forgetComparisonHandle(comparisonKey);
      if (mounted.current) data.setError(run.error);
    } finally { if (mounted.current && !abort.signal.aborted) { setRunning(false); setJob(null); } }
  }, [data.rpc, data.setError, comparisonKey]);
  useEffect(() => {
    if (tool !== 'experiments' || !comparisonKey) return;
    const retained = comparisonRuns.get(comparisonKey) ?? retainedRun;
    if (retained?.status === 'running') void attachComparison(retained);
    else if (retained?.error) data.setError(retained.error);
  }, [tool, comparisonKey, attachComparison, data.setError, retainedRun]);
  const runComparison = async () => {
    if (running || !path || !suite?.cases.length || unprepared || !comparisonKey) return;
    const active = comparisonRuns.get(comparisonKey);
    if (active?.status === 'running') { await attachComparison(active); return; }
    const run: ComparisonRun = {
      suiteId: suite.id, suitePath: suite.path, source, cases: JSON.stringify(suite.cases), setupKey, caseDefinitions: structuredClone(suite.cases), status: 'running',
      input: { projectId: props.projectId, agentPath: path, path: suite.path, source, compare: true, preparedCaseIds: [...prepared], startedByUser: true, ...(props.threadId ? { threadId: props.threadId } : {}) },
    };
    if (!rememberComparison(comparisonKey, run)) { data.setError('Finish or stop another comparison before starting a new one.'); return; }
    await attachComparison(run);
  };
  let body: ReactNode, actions: ReactNode, detail: string | undefined, back: (() => void) | undefined;
  if (tool === 'sessions') {
    const session = data.sessions.find(row => row.id === selected), evidence = rows.find(row => row.id === selected);
    const matchingSessions = data.sessions.filter(row => matches(sessionSearchText(row)) && (filter === 'all' || row.execution?.verdict?.outcome === filter));
    const matchingEvidence = rows.filter(row => matches(`${row.name} ${row.suite} ${row.result.runId}`) && (filter === 'all' || row.result.outcome === filter));
    if (session || evidence) { detail = session ? sessionTitle(session) : evidence!.name; back = () => setSelected(null); }
    else actions = <button disabled={!query && filter === 'all'} onClick={resetFilters}>Reset filters</button>;
    body = selected && (session || evidence) ? <>
      {session ? <><p className="sf-builder-note">{sessionMode(session)} · {session.orgAlias} · {stamp(session.createdAt)}</p><div className="sf-builder-card"><h3>Conversation replay</h3><p>Open the retained transcript, action trace, and runtime details.</p><button className="sf-builder-primary" disabled={replaying} onClick={() => void replay(session.id)}>Replay conversation</button></div></> : evidence && <>
        <p className="sf-builder-note">{evidence.suite} · {stamp(evidence.result.at)} {pill(evidence.result.stopped ? 'stopped' : evidence.result.outcome)}</p>
        {(evidence.result.conversation ?? []).map((message, index) => <div className="sf-builder-message" data-role={message.role} key={index}><small>{message.role === 'user' ? 'Customer' : 'Agent'}</small><p>{message.message}</p></div>)}
        {evidence.result.conversationTruncated && <p className="sf-builder-note">This saved conversation is truncated. The full recording is available only while its runtime trace is retained.</p>}
        {!evidence.result.conversation?.length && <p>{evidence.result.reply ?? 'No transcript was retained for this result.'}</p>}
        {evidence.result.notes?.map((note, index) => <p key={index}>{note}</p>)}
        {evidence.result.runId && (data.sessions.some(row => row.id === evidence.result.runId)
          ? <button disabled={replaying} onClick={() => void replay(evidence.result.runId)}>Open retained runtime trace</button>
          : <p className="sf-builder-note">The runtime trace is no longer retained. The saved conversation above remains available.</p>)}
      </>}
    </> : <><div className="sf-builder-filters"><input type="search" placeholder="Search sessions…" aria-label="Search sessions" value={query} onChange={e => setQuery(e.target.value)} /><PopoverPicklist ariaLabel="Session outcome" triggerClassName="sf-builder-picklist" value={filter} onChange={setFilter} searchable={false} minWidth={180} options={[
        { value: 'all', label: 'All outcomes' }, { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'inconclusive', label: 'Inconclusive' },
      ]} /></div>
      <p className="sf-builder-note">Retained runtime sessions and latest saved case recordings. Runtime sessions expire; saved case evidence remains.</p>
      {resultCount(matchingSessions.length + matchingEvidence.length, 'conversation')}
      <div className="sf-builder-list" aria-label="Recorded sessions">
        {matchingSessions.map(row => <button className="sf-builder-row" key={row.id} data-resource-id={row.id} onClick={() => setSelected(row.id)}><span><strong>{sessionTitle(row)}</strong><small>{row.orgAlias} · {row.turnCount === undefined ? 'Turn count unavailable' : `${row.turnCount} ${row.turnCount === 1 ? 'turn' : 'turns'}`} · {stamp(row.createdAt)}</small></span>{pill(row.execution?.verdict?.outcome ?? (row.failed ? 'error' : row.closed ? 'ended' : 'open'))}</button>)}
        {matchingEvidence.map(row => <button className="sf-builder-row" key={row.id} data-resource-id={row.id} onClick={() => setSelected(row.id)}><span><strong>{row.name}</strong><small>Saved case · {stamp(row.result.at)}</small></span>{pill(row.result.stopped ? 'stopped' : row.result.outcome)}</button>)}
      </div>
      {!!(rows.length + data.sessions.length) && !matchingEvidence.length && !matchingSessions.length && empty('No conversations match these filters', <button onClick={resetFilters}>Clear filters</button>)}
      {!data.loading && !rows.length && !data.sessions.length && empty('No recorded conversations yet', <button onClick={() => onOpenTool('preview')}>Open Preview</button>, 'Run a preview or evaluation to record a conversation.')}
    </>;
  } else if (tool === 'analytics') {
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 86_400_000;
    const rangedRows = rows.filter(row => row.result.at >= cutoff), metrics = evidenceSummary(rangedRows, data.sessions);
    actions = <label className="sf-builder-range">Range<PopoverPicklist ariaLabel="Analytics range" triggerClassName="sf-builder-picklist" value={range} onChange={setRange} searchable={false} options={[
      { value: 'all', label: 'All recorded results' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' },
    ]} /></label>;
    body = <><p className="sf-builder-note">Latest saved case results for {path ?? 'this project'}. These are evaluation metrics, not production traffic.</p>
      <div className="sf-builder-metrics">{[['Pass rate', metrics.passRate === null ? '—' : `${metrics.passRate}%`], ['Saved cases', metrics.total], ['Failed', metrics.fail], ['Median max turn latency', metrics.medianLatency === null ? '—' : `${metrics.medianLatency} ms`]].map(([name, value]) => <div key={name}><small>{name}</small><strong>{value}</strong></div>)}</div>
      <section className="sf-builder-card"><div className="sf-builder-section-heading"><h3>Evaluation outcomes</h3><button onClick={() => onOpenTool('evals')}>Open Evals</button></div><div className="sf-builder-bars">{[['Pass', metrics.pass], ['Fail', metrics.fail], ['Inconclusive / stopped', metrics.inconclusive]].map(([name, count]) => <div key={name}><span>{name}</span><meter data-outcome={name === 'Pass' ? 'pass' : name === 'Fail' ? 'fail' : 'inconclusive'} min={0} max={Math.max(1, metrics.total)} value={Number(count)} aria-label={String(name)} /><strong>{count}</strong></div>)}</div></section>
      <section className="sf-builder-card"><div className="sf-builder-section-heading"><h3>Recorded custom scores</h3><button onClick={() => onOpenTool('scorers')}>Open Scorers</button></div><p>Rules are pinned when a scenario run or comparison starts. These counts use the saved snapshots; editing a scorer does not change past verdicts.</p>
        {metrics.scorerChecks.map(check => <div className="sf-builder-row" key={JSON.stringify([check.revision, check.id, check.name, check.kind, check.value])}><span><strong>{check.name}</strong><small>Snapshot {check.revision} · {check.kind}: {check.value}</small></span><span className="sf-builder-score-counts" aria-label={`${check.name}, snapshot ${check.revision}: ${check.pass} pass, ${check.fail} fail, ${check.inconclusive} inconclusive`}>{pill(`${check.pass} pass`)}{pill(`${check.fail} fail`)}{pill(`${check.inconclusive} inconclusive`)}</span></div>)}
        {!metrics.scorerChecks.length && <p>No custom scores were recorded in these results. Run scenarios after saving a project scorer to include it.</p>}
      </section>
      <section className="sf-builder-card"><div className="sf-builder-section-heading"><h3>Observed action coverage</h3><button onClick={() => onOpenTool('actions')}>Inspect actions</button></div>{metrics.actions.map(([name, count]) => <div className="sf-builder-row" key={name}><code>{name}</code><span>{count} {count === 1 ? 'case' : 'cases'}</span></div>)}{!metrics.actions.length && <p>No action traces were recorded in these results.</p>}</section>
      {!data.loading && !metrics.total && empty(rows.length ? 'No evaluation results in this range' : 'No evaluation results yet', rows.length ? <button onClick={() => setRange('all')}>Show all recorded results</button> : <button onClick={() => onOpenTool('evals')}>Run evaluations</button>, 'Run a case suite to populate outcome and latency metrics.')}
    </>;
  } else if (tool === 'issues') {
    const failed = rows.filter(row => row.result.outcome === 'fail' && !row.result.stopped);
    const diagnosticRows = diagnostics.filter(row => filter !== 'evals' && matches(`${row.severity} ${row.message} ${row.line}`));
    const failedRows = failed.filter(row => filter !== 'diagnostics' && matches(`${row.name} ${row.result.notes?.join(' ') ?? ''}`));
    body = <><div className="sf-builder-filters"><input type="search" aria-label="Search issues" placeholder="Search issues…" value={query} onChange={e => setQuery(e.target.value)} /><PopoverPicklist ariaLabel="Issue source" triggerClassName="sf-builder-picklist" value={filter} onChange={setFilter} searchable={false} options={[
        { value: 'all', label: 'All sources' }, { value: 'diagnostics', label: 'Editor diagnostics' }, { value: 'evals', label: 'Evaluation failures' },
      ]} /></div>
      {resultCount(diagnosticRows.length + failedRows.length, 'issue')}
      {diagnosticRows.map((diagnostic, index) => <article className="sf-builder-card" key={index}>{pill(diagnostic.severity)}<h3>{diagnostic.message}</h3><p>Editor diagnostic · Line {diagnostic.line}</p><div className="sf-builder-filters"><button onClick={() => props.onReveal(diagnostic.line)}>Reveal in Script</button><button onClick={() => onAskAgent(`Investigate this ${diagnostic.severity} in ${path}, line ${diagnostic.line}: ${diagnostic.message}. Propose a focused fix and explain how to verify it.`)}>Ask Assistant to fix</button></div></article>)}
      {failedRows.map(row => <article className="sf-builder-card" key={row.id}>{pill('fail')}<h3>{row.name}</h3><p>{row.result.notes?.join(' · ') || 'The recorded response did not satisfy this case.'}</p><div className="sf-builder-filters"><button onClick={() => onOpenTool('evals')}>Review Evals</button><button onClick={() => onAskAgent(`Investigate the failed case "${row.name}" in ${row.suite}, agent ${path}. Recorded evidence: ${JSON.stringify(row.result).slice(0, 6000)}. Propose a focused fix and rerun the relevant cases after review.`)}>Investigate with Assistant</button></div></article>)}
      {!!(diagnostics.length + failed.length) && !diagnosticRows.length && !failedRows.length && empty('No issues match these filters', <button onClick={resetFilters}>Clear filters</button>)}
      {!data.loading && !diagnostics.length && !failed.length && empty('No recorded issues', <button onClick={() => onOpenTool('evals')}>Run evaluations</button>, 'Editor diagnostics and failed evaluation cases appear here.')}
    </>;
  } else if (tool === 'scorers') {
    const chosen = data.resources.scorers.find(row => row.id === selected);
    const builtIns = [['Scenario assertions', 'Topic, expected and forbidden actions, response text, and state checks.'], ['AI success criteria', 'The existing runtime judge evaluates each case’s criteria.'], ['Response latency', 'Maximum response latency against the case threshold.']];
    const matchingScorers = data.resources.scorers.filter(row => matches(`${row.name} ${row.kind} ${row.value}`));
    const matchingBuiltIns = builtIns.filter(row => matches(row.join(' ')));
    const create = () => { begin(); setScorer({ id: '', name: '', kind: 'contains', value: '' }); setCreating(true); };
    const save = async (event: FormEvent) => {
      event.preventDefault();
      if (scorer.id && !data.resources.scorers.some(row => row.id === scorer.id)) { data.setError('This scorer was deleted in another window. Cancel to return to the list.'); return; }
      const next = { ...scorer, id: scorer.id || id() };
      if (await data.save({ ...data.resources, scorers: scorer.id ? data.resources.scorers.map(row => row.id === scorer.id ? next : row) : [...data.resources.scorers, next] })) {
        setCreating(false); setNotice(scorer.id ? 'Scorer updated. Future runs use this rule; recorded verdicts are unchanged.' : 'Scorer saved to this project.');
      }
    };
    if (creating) {
      detail = scorer.id ? 'Edit scorer' : 'New scorer'; back = () => setCreating(false);
      actions = <><button disabled={data.saving} onClick={() => setCreating(false)}>Cancel</button><button type="submit" form={formId} className="sf-builder-primary" disabled={!data.canSave}>Save scorer</button></>;
    } else if (chosen) {
      detail = chosen.name; back = () => setSelected(null);
      actions = <><button disabled={!data.canSave} onClick={() => { begin(); setScorer({ ...chosen }); setCreating(true); }}>Edit scorer</button><button className="sf-builder-danger" disabled={!data.canSave} onClick={async () => { if (await data.save({ ...data.resources, scorers: data.resources.scorers.filter(row => row.id !== chosen.id) })) { setSelected(null); setNotice('Scorer deleted.'); } }}>Delete scorer</button></>;
    } else actions = <button className="sf-builder-primary" disabled={!data.canSave || data.resources.scorers.length >= BUILDER_LIMITS.scorers} onClick={create}><Plus size={14} aria-hidden="true" />New scorer</button>;
    body = creating ? <form id={formId} onSubmit={save}><fieldset className="sf-builder-form-fields" disabled={data.saving}>
      <label>Name<input autoFocus required maxLength={120} value={scorer.name} onChange={e => setScorer({ ...scorer, name: e.target.value })} /></label>
      <label>Rule<PopoverPicklist<BuilderScorer['kind']> ariaLabel="Rule" triggerClassName="sf-builder-picklist" value={scorer.kind} disabled={data.saving} onChange={kind => setScorer({ ...scorer, kind, value: '' })} searchable={false} options={[
        { value: 'contains', label: 'Response contains' }, { value: 'excludes', label: 'Response excludes' }, { value: 'latency', label: 'Maximum latency (ms)' },
      ]} /></label>
      <label>{scorer.kind === 'latency' ? 'Threshold in milliseconds' : 'Text to match'}<input required maxLength={2000} type={scorer.kind === 'latency' ? 'number' : 'text'} min={1} max={scorer.kind === 'latency' ? 600000 : undefined} value={scorer.value} onChange={e => setScorer({ ...scorer, value: e.target.value })} /></label>
      <p className="sf-builder-note">Project rules apply to new scenario runs and comparisons. Each run saves its rule snapshot. Published-agent org evaluations use their own configured checks.</p>
    </fieldset></form> : chosen ? <>
      <div className="sf-builder-card"><h3>Scoring rule</h3><p>{chosen.kind === 'latency' ? 'Maximum latency' : chosen.kind === 'contains' ? 'Response contains' : 'Response excludes'}: <code>{chosen.value}</code></p><p>Applied to the final agent response, or the slowest recorded turn for latency. Incomplete evidence may be inconclusive. New scenario runs and comparisons combine these checks with the built-in checks to determine the verdict.</p></div>
      <section aria-label="Recorded scorer results"><h3>Recorded scores</h3><p className="sf-builder-note">The rule used during execution is preserved, including earlier versions of this scorer.</p>{rows.map(row => {
        const evaluation = row.result.scorerEvaluation, check = evaluation?.checks.find(check => check.id === chosen.id);
        return <div className="sf-builder-row" key={row.id}><span><strong>{row.name}</strong><small>{check ? `Snapshot ${evaluation!.revision} · ${check.kind}: ${check.value}` : 'Run predates this scorer or did not apply it'}</small></span>{pill(check?.outcome ?? 'not recorded')}</div>;
      })}</section>
      <details className="sf-builder-score-preview"><summary>Preview current rule on saved responses</summary><p className="sf-builder-note">Preview only. These scores do not overwrite recorded verdicts.</p>{resultCount(rows.length, 'response')}{rows.map(row => <div className="sf-builder-row" key={row.id}><span>{row.name}</span>{pill(scoreEvidence(chosen, row.result))}</div>)}</details>
      {!data.loading && !rows.length && empty('No saved responses to score', <button onClick={() => onOpenTool('evals')}>Open Evals</button>)}
    </> : <><div className="sf-builder-filters"><input type="search" aria-label="Search scorers" placeholder="Search scorers…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {resultCount(matchingScorers.length + matchingBuiltIns.length, 'scorer')}
      <div className="sf-builder-card-grid">
        {[...matchingScorers].reverse().map(row => <button className="sf-builder-scorer-card" key={row.id} data-resource-id={row.id} onClick={() => { begin(); setSelected(row.id); }}><strong>{row.name}</strong><span>{row.kind === 'latency' ? 'Maximum response latency' : row.kind === 'contains' ? 'Response contains' : 'Response excludes'}: {row.value}</span><small>{pill('Project')}{pill(row.kind)}</small></button>)}
        {matchingBuiltIns.map(([name, text]) => <article className="sf-builder-scorer-card" key={name}><strong>{name}</strong><span>{text}</span><small>{pill('Built in')}<button onClick={() => onOpenTool('evals')}>Configure in Evals</button></small></article>)}
      </div>
      {!matchingScorers.length && !matchingBuiltIns.length && empty('No scorers match your search', <button onClick={() => setQuery('')}>Clear search</button>)}
      {data.resources.scorers.length >= BUILDER_LIMITS.scorers && <p className="sf-builder-note">This project has reached the {BUILDER_LIMITS.scorers}-scorer limit. Edit or delete an existing scorer to continue.</p>}
    </>;
  } else if (tool === 'compare') {
    const diff = savedSource === null ? null : lineDiff(comparableText(savedSource), comparableText(source));
    const stats = diff && diffStats(diff);
    actions = <div className="sf-builder-segment" role="group" aria-label="Diff layout"><button aria-pressed={!sideBySide} onClick={() => setSideBySide(false)}>Inline</button><button aria-pressed={sideBySide} onClick={() => setSideBySide(true)}>Side by side</button></div>;
    body = !path ? empty('Open an agent to compare its source', <button onClick={() => onOpenTool('files')}>Open an agent</button>) : <>
      <div className="sf-builder-comparison-labels"><span>Saved file</span><span aria-hidden="true">→</span><span>Editor draft</span></div><p className="sf-builder-note">{path}</p>
      {diff && stats && <p className="sf-builder-diff-summary"><span>+{stats.added} additions</span><span>−{stats.removed} removals</span></p>}
      {!diff ? <p role="status">The saved source is unavailable or this change is too large for the inline diff. Review it in Script.</p> : !stats?.added && !stats?.removed ? empty('No changes between saved source and draft', undefined, 'Edit the script to review your changes here.') : sideBySide ? <div className="sf-builder-diff-split"><div><h3>Saved file</h3><pre aria-label="Saved source">{savedSource?.slice(0, 100000)}</pre></div><div><h3>Editor draft</h3><pre aria-label="Editor draft">{source.slice(0, 100000)}</pre></div></div> : <div className="sf-builder-diff" aria-label="Draft changes">{foldDiff(diff).map((hunk, index) => hunk.type === 'gap' ? <div className="sf-builder-gap" key={index}>{hunk.count} unchanged lines</div> : <pre key={index}>{hunk.lines.map((line, i) => <span data-change={line.type} key={i}>{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '} {line.text}{'\n'}</span>)}</pre>)}</div>}
      <div className="sf-builder-filters"><button onClick={() => props.onReveal(1)}>Open in Script</button><button onClick={() => onOpenTool('experiments')}>Evaluate both sources</button></div>
    </>;
  } else if (tool === 'experiments') {
    body = <><details className="sf-builder-experiment-setup" open={!comparison?.value}><summary><strong>Comparison setup</strong><span data-required={unprepared || undefined}>{unprepared ? 'Setup required' : suite ? `${suite.cases.length} cases` : 'Choose a suite'}</span></summary><div><p className="sf-builder-note">Run both sources with the same scripted cases in Simulate. Actions are simulated.</p>
      <label>Evaluation suite<PopoverPicklist ariaLabel="Experiment suite" triggerClassName="sf-builder-picklist" value={suite?.id ?? ''} disabled={running || !data.suites.length} placeholder="No evaluation suites available" title={suite?.path} searchable={data.suites.length > 6} searchPlaceholder="Search evaluation suites…" emptyHint="No matching evaluation suites" onChange={value => { begin(); setSuiteId(value); setComparison(null); }}
        options={data.suites.map(row => ({ value: row.id, label: `${row.path} · ${row.cases.length} cases`, className: 'sf-builder-suite-option' }))} /></label>
      {suite?.cases.some(row => row.prerequisites?.length) && <fieldset className="sf-builder-prerequisites" disabled={running}><legend>Setup prerequisites</legend><p>Confirm each case’s setup before comparing both sources.</p>{suite.cases.filter(row => row.prerequisites?.length).map(row => <label className="sf-builder-setting" key={row.id}><span><strong>{row.name}</strong><ul>{row.prerequisites!.map((text, index) => <li key={index}>{text}</li>)}</ul></span><input type="checkbox" aria-label={`Prepared: ${row.name}`} checked={prepared.includes(row.id)} onChange={event => setPreparation({ key: setupKey, ids: event.target.checked ? [...prepared, row.id] : prepared.filter(value => value !== row.id) })} /></label>)}</fieldset>}
      </div></details>
      <div className="sf-builder-filters"><button className="sf-builder-primary" title={unprepared ? 'Confirm the prerequisites in Comparison setup first.' : undefined} disabled={running || !path || !suite?.cases.length || unprepared || data.loading} onClick={() => { setStopping(false); void runComparison(); }}>{running ? 'Comparing…' : 'Run comparison'}</button>{job && <button disabled={stopping} onClick={() => { setStopping(true); void data.rpc(STUDIO_RPC.suiteStop, { jobId: job }).catch(err => { setStopping(false); data.setError(failure(err)); }); }}>{stopping ? 'Stopping…' : 'Stop comparison'}</button>}{comparison?.value && <button disabled={!data.canSave} onClick={async () => { if (await saveArtifact('Source comparison.json', JSON.stringify(comparison.value, null, 2))) setNotice('Comparison report saved in Files.'); }}>Save report to Files</button>}</div>
      <p className="sf-builder-note">Reopening reconnects to this comparison while its Studio job is retained. Save a report to keep results after Studio restarts.</p>
      {comparison?.recovered && <p className="sf-builder-note">Recovered from an owned job handle. The original editor draft was not stored locally; verify the source hashes before using this result.</p>}
      {comparison?.value && <SuiteComparisonView comparison={comparison.value} cases={comparison.caseDefinitions} stale={comparison.source !== source || comparison.suiteId !== suite?.id || comparison.cases !== JSON.stringify(suite?.cases)} />}
      {!data.loading && !data.suites.length && empty('Create an evaluation suite first', <button onClick={() => onOpenTool('evals')}>Open Evals</button>)}
      {!path && empty('Open an agent to run a comparison', <button onClick={() => onOpenTool('files')}>Open an agent</button>)}
    </>;
  } else if (tool === 'artifacts') {
    const chosen = data.resources.artifacts.find(row => row.id === selected);
    const matchingArtifacts = data.resources.artifacts.filter(row => matches(row.name));
    const cancel = () => { setCreating(false); data.setError(null); };
    if (creating) {
      detail = artifact.id ? 'Edit file' : 'New file'; back = cancel;
      actions = <><button disabled={data.saving} onClick={cancel}>Cancel</button><button type="submit" form={formId} className="sf-builder-primary" disabled={!data.canSave}>Save file</button></>;
    } else if (chosen) {
      detail = chosen.name; back = () => setSelected(null);
      actions = <><button disabled={!data.canSave} onClick={() => { begin(); setArtifact({ ...chosen }); setCreating(true); }}>Edit file</button><button className="sf-builder-danger" disabled={!data.canSave} onClick={async () => { if (await data.save({ ...data.resources, artifacts: data.resources.artifacts.filter(row => row.id !== chosen.id) })) { setSelected(null); setNotice('File deleted.'); } }}>Delete file</button></>;
    } else actions = <button className="sf-builder-primary" disabled={!data.canSave || data.resources.artifacts.length >= BUILDER_LIMITS.artifacts} onClick={() => { begin(); setArtifact({ id: '', name: 'Improvement plan.md', content: '' }); setCreating(true); }}><Plus size={14} aria-hidden="true" />New file</button>;
    body = creating ? <form id={formId} onSubmit={async e => {
      e.preventDefault();
      if (artifact.id && !data.resources.artifacts.some(row => row.id === artifact.id)) { data.setError('This file was deleted in another window. Cancel to return to the list.'); return; }
      const saved = artifact.id ? await data.save({ ...data.resources, artifacts: data.resources.artifacts.map(row => row.id === artifact.id ? artifact : row) }) : await saveArtifact(artifact.name, artifact.content);
      if (saved) { setCreating(false); setNotice(artifact.id ? 'File updated in this project’s workspace.' : 'File saved to this project’s workspace.'); }
    }}><fieldset className="sf-builder-form-fields" disabled={data.saving}><label>File name<input autoFocus required maxLength={120} value={artifact.name} onChange={e => setArtifact({ ...artifact, name: e.target.value })} /></label><label>Content<textarea aria-label="Content" rows={16} maxLength={BUILDER_LIMITS.content} value={artifact.content} onChange={e => setArtifact({ ...artifact, content: e.target.value })} /></label><p className="sf-builder-note">{artifact.content.length.toLocaleString()} / {BUILDER_LIMITS.content.toLocaleString()} characters</p></fieldset></form> : chosen ? <>
      <pre className="sf-builder-file">{chosen.content || 'This file is empty.'}</pre><div className="sf-builder-filters"><button onClick={() => {
        const url = URL.createObjectURL(new Blob([chosen.content], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = chosen.name.replace(/[\\/]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Download size={14} aria-hidden="true" />Download file</button><button onClick={() => onAskAgent(`Review this project workspace file, ${chosen.name}:\n${chosen.content.slice(0, 10000)}`)}>Discuss with Assistant</button></div>
    </> : <>
      <div className="sf-builder-filters"><label className="sf-builder-upload" aria-disabled={!data.canSave || data.resources.artifacts.length >= BUILDER_LIMITS.artifacts}><span>Import text file</span><input type="file" accept=".txt,.md,.json,.yaml,.yml,.csv" disabled={!data.canSave || data.resources.artifacts.length >= BUILDER_LIMITS.artifacts} onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; begin();
        if (file.size > BUILDER_LIMITS.content) { data.setError('Choose a text file smaller than 50 KB.'); return; }
        try { const content = await file.text(); if (mounted.current) { setArtifact({ id: '', name: file.name, content }); setCreating(true); } } catch (err) { if (mounted.current) data.setError(failure(err)); }
      }} /></label><button disabled={!data.canSave || !rows.length || data.resources.artifacts.length >= BUILDER_LIMITS.artifacts} onClick={async () => { if (await saveArtifact('Evaluation results.json', JSON.stringify(rows, null, 2))) setNotice('Evaluation report saved.'); }}>Save evaluation report</button></div>
      <p className="sf-builder-note">Plans and reports saved with this project. AgentScript, Apex, and Flow source files remain in the explorer.</p>
      <div className="sf-builder-filters"><input type="search" aria-label="Search workspace files" placeholder="Search files…" value={query} onChange={e => setQuery(e.target.value)} /></div>{resultCount(matchingArtifacts.length, 'file')}
      <div className="sf-builder-list">{matchingArtifacts.map(row => <button className="sf-builder-row" key={row.id} data-resource-id={row.id} onClick={() => { begin(); setSelected(row.id); }}><span><strong>{row.name}</strong><small>{row.content.length.toLocaleString()} characters</small></span><span aria-hidden="true">→</span></button>)}</div>
      {!!data.resources.artifacts.length && !matchingArtifacts.length && empty(`No workspace files match “${query}”`, <button onClick={() => setQuery('')}>Clear search</button>)}
      {!data.loading && !data.resources.artifacts.length && empty('No workspace files yet', undefined, 'Create a plan, import a text file, or save an evaluation report.')}
      {data.resources.artifacts.length >= BUILDER_LIMITS.artifacts && <p className="sf-builder-note">This project has reached the {BUILDER_LIMITS.artifacts}-file limit. Edit or delete a file to continue.</p>}
    </>;
  } else if (tool === 'settings') {
    body = <><section className="sf-builder-card"><h3>Editor</h3><p>Preferences apply to the current workspace and are saved automatically.</p>{([['lines', 'Show line numbers', 'Keep line references visible beside your script.'], ['wrap', 'Wrap long lines', 'Read long instructions without horizontal scrolling.']] as const).map(([key, label, hint]) => <label className="sf-builder-setting" key={key}><span>{label}<small>{hint}</small></span><input type="checkbox" aria-label={label} checked={props.preferences[key]} onChange={e => props.onPreferences({ ...props.preferences, [key]: e.target.checked })} /></label>)}</section>
      {props.contextSharing !== false && <section className="sf-builder-card"><h3>Assistant</h3><label className="sf-builder-setting"><span>Share context with Assistant<small>Share the current Studio view, selection, and diagnostics. Explicit help requests still include their stated evidence.</small></span><input type="checkbox" aria-label="Share context with Assistant" checked={props.share} onChange={e => props.onShare(e.target.checked)} /></label></section>}
      <section className="sf-builder-card"><h3>Studio keyboard shortcuts</h3><div className="sf-builder-row">Save <kbd>⌘ / Ctrl S</kbd></div><div className="sf-builder-row">Go to file <kbd>⌘ / Ctrl P</kbd></div><div className="sf-builder-row">Toggle explorer <kbd>⌘ / Ctrl B</kbd></div></section>
    </>;
  } else if (tool === 'import') {
    body = <><div className="sf-builder-card"><h3>Connect your workflow</h3><p>Import a named shortcut to an existing Studio tool using a JSON manifest.</p></div>
      <form onSubmit={async e => { e.preventDefault(); begin(); try { const parsed = parseToolManifest(JSON.parse(manifest)); if (await data.save({ ...data.resources, shortcuts: [...data.resources.shortcuts, { ...parsed, id: id() }] })) setNotice('Tool shortcut imported.'); } catch (err) { data.setError(failure(err)); } }}>
        <label>Tool manifest<textarea className="sf-builder-code-input" aria-label="Tool manifest" rows={8} maxLength={4000} value={manifest} spellCheck={false} onChange={e => setManifest(e.target.value)} /></label>
        <button className="sf-builder-primary" disabled={!data.canSave || data.resources.shortcuts.length >= BUILDER_LIMITS.shortcuts}>Import tool shortcut</button>
      </form><p className="sf-builder-note">Supported targets: Evals (evals), Sessions (sessions), Analytics (analytics), Issues (issues), Scorers (scorers), Experiments (experiments), Compare (compare), Files (artifacts), and Settings (settings).</p>
      <h3>Project shortcuts</h3>{data.resources.shortcuts.map(row => <div className="sf-builder-row" key={row.id}><button className="sf-builder-shortcut" onClick={() => onOpenTool(row.tool)}><strong>{row.name}</strong><small>{row.description}</small></button><button className="sf-builder-icon-button sf-builder-danger" aria-label={`Delete ${row.name}`} disabled={!data.canSave} onClick={() => void data.save({ ...data.resources, shortcuts: data.resources.shortcuts.filter(item => item.id !== row.id) })}>×</button></div>)}
      {!data.loading && !data.resources.shortcuts.length && <p className="sf-builder-note">No shortcuts imported yet.</p>}
      {data.resources.shortcuts.length >= BUILDER_LIMITS.shortcuts && <p className="sf-builder-note">This project has reached the {BUILDER_LIMITS.shortcuts}-shortcut limit. Delete a shortcut to import another.</p>}
    </>;
  }
  const localTool = tool === 'settings' || tool === 'compare';
  const projectTool = ['scorers', 'artifacts', 'settings', 'import'].includes(tool);
  const workspaceKey = creating ? 'form' : detail ? `detail:${selected}` : 'list';
  useEffect(() => {
    const previous = previousWorkspace.current;
    previousWorkspace.current = { key: workspaceKey, selected };
    // Forms already focus their first field. Other drilldowns replace the
    // focused control, so give the new workspace a predictable keyboard entry.
    if (!previous || previous.key === workspaceKey || creating || !props.visible) return;
    const root = workspaceRoot.current!;
    // A save may finish after the user has moved back into Script or another
    // panel. Do not take their focus away from that work.
    if (document.activeElement !== document.body && !root.contains(document.activeElement)) return;
    if (detail) {
      const heading = root.querySelector<HTMLHeadingElement>('.sf-builder-header h2')!;
      heading.tabIndex = -1;
      heading.focus();
    } else {
      const origin = [...root.querySelectorAll<HTMLButtonElement>('button[data-resource-id]')].find(row => row.dataset.resourceId === previous.selected);
      (origin ?? root.querySelector<HTMLInputElement>('input[type="search"]'))?.focus();
    }
  }, [workspaceKey, selected, creating, detail, props.visible]);
  return <section ref={workspaceRoot} className="sf-builder-tool" data-testid={`studio-builder-${tool}`} aria-label={title.title} aria-busy={data.loading || data.saving}>
    <StudioToolHeader title={title.title} description={title.description} detail={detail} onBack={back} disabled={data.saving}
      context={<><span title={path ?? undefined}>{tool === 'settings' ? 'This device' : projectTool ? 'Project workspace' : path?.split('/').pop() ?? 'Project workspace'}</span>{' · '}{tool === 'settings' ? 'Preferences saved locally' : projectTool ? 'Shared across this project' : tool === 'compare' || tool === 'experiments' ? 'Saved source and editor draft' : path ? 'Recorded agent evidence' : 'All project agents'}</>}
      actions={<>{actions}{!localTool && <button className="sf-builder-icon-button" aria-label={`Refresh ${title.title}`} title={`Refresh ${title.title}`} disabled={data.loading || data.saving} onClick={() => void data.reload()}><RefreshCw size={15} aria-hidden="true" /></button>}</>} />
    <div className="sf-builder-body" key={creating ? 'form' : selected ?? 'list'}>
      {data.loading && <p className="sf-builder-loading" role="status">Loading project evidence…</p>}
      {data.error && <div className="sf-builder-error" role="alert"><span>{data.error}</span><button disabled={data.loading || data.saving} onClick={() => void data.reload()}>Try again</button></div>}
      {notice && <div className="sf-builder-notice" role="status"><span>{notice}</span><button className="sf-builder-icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
      {data.saving && <p className="sf-builder-loading" role="status">Saving changes…</p>}{body}
    </div>
  </section>;
}

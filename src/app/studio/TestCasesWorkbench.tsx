import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PopoverPicklist } from '@zana-ai/zcc-ui/popover-picklist';
import { Trash2 } from 'lucide-react';
import type { CaseOutcome, CaseResult, ScenarioCase, SuiteEval, SuiteProgress } from '../../../lib/studio-contract.js';
import { caseChecks, failureReason } from '../../../lib/case-checks.js';
import { TEST_CASES_STYLES } from './test-cases-styles.js';
import { ConversationScope } from './ConversationScope.js';
import { useStudioSplit } from './StudioResize.js';

export type CaseStatus = CaseOutcome | 'stopped' | 'not-run' | 'setup' | 'running' | 'queued';
export type CaseFilter = 'all' | CaseStatus;
const LABEL: Record<CaseStatus, string> = { pass: 'Passed', fail: 'Failed', inconclusive: 'Needs review', stopped: 'Stopped', 'not-run': 'Not run', setup: 'Setup required', running: 'Running…', queued: 'Queued' };
const SYMBOL: Record<CaseStatus, string> = { pass: '✓', fail: '✕', inconclusive: '?', stopped: '■', 'not-run': '–', setup: '!', running: '◷', queued: '◷' };

export function caseStatus(result?: CaseResult): CaseStatus {
  if (!result) return 'not-run';
  if (result.setupBlocked) return 'setup';
  // Older saved attempts predate the explicit cancellation flag. Match only
  // the known AbortError text, not arbitrary transport or evaluation failures.
  if (result.stopped || result.outcome === 'inconclusive' && result.notes?.some(note => /^This operation was aborted\.?$/.test(note))) return 'stopped';
  return result.outcome;
}

function Badge({ status, id }: { status: CaseStatus; id?: string }) {
  return <span id={id} className={`sf-cases-badge is-${status}`}><span aria-hidden="true">{SYMBOL[status]}</span> {LABEL[status]}</span>;
}

interface Props {
  storageKey?: string;
  cases: ScenarioCase[];
  results: Record<string, CaseResult | undefined>;
  progress?: SuiteProgress;
  lastEval?: SuiteEval;
  proposal?: Record<string, CaseOutcome | undefined>;
  filter: CaseFilter;
  onFilterChange(filter: CaseFilter): void;
  running: boolean;
  sourceReady: boolean;
  prepared: string[];
  onPreparedChange(id: string, prepared: boolean): void;
  onRun(id: string): void;
  onRemove(id: string): void;
  onFix?(c: ScenarioCase): void;
  onShowPath?(id: string): void;
  renderVariables?(scenario: ScenarioCase): ReactNode;
}

const TABS = ['Result', 'Conversation', 'Expectations', 'Variables'] as const;
type Tab = typeof TABS[number];

/** One independently scrolling catalogue and one readable case inspector. */
export function TestCasesWorkbench(props: Props) {
  const { cases, results, progress, lastEval, proposal, filter, onFilterChange, running, sourceReady, prepared } = props;
  const prefix = useId();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [tab, setTab] = useState<Tab>('Result');
  const tabs = props.renderVariables ? TABS : TABS.slice(0, 3);
  const root = useRef<HTMLDivElement>(null);
  const split = useStudioSplit({ storageKey: props.storageKey, initial: 36, breakpoint: 760, stack: false, minPane: 170 });
  const splitRef = split.ref;
  const setRoot = useCallback((element: HTMLDivElement | null) => { root.current = element; splitRef(element); }, [splitRef]);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  const statusOf = (c: ScenarioCase): CaseStatus => {
    if (progress?.mode === 'simulate' && progress.caseIds.includes(c.id) && !progress.results[c.id]) return progress.currentCaseId === c.id ? 'running' : 'queued';
    return caseStatus(results[c.id]);
  };
  const shown = cases.filter(c => (filter === 'all' || statusOf(c) === filter || progress?.caseIds.includes(c.id)) && `${c.name} ${c.utterances.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = shown.find(c => c.id === selectedId) ?? shown[0];
  const status = selected ? statusOf(selected) : 'not-run';
  const pending = status === 'running' || status === 'queued';
  const evidence = selected && !pending ? results[selected.id] : undefined;
  const checks = selected ? caseChecks(selected.expect, evidence) : [];
  const technical = checks.filter(check => check.kind !== 'criteria');
  const conversation = evidence?.conversation;
  const reason = failureReason(evidence);
  const summarized = (actual: string) => (status === 'fail' || status === 'inconclusive') && Boolean(reason?.includes(actual));
  const assessment = checks.filter(check => check.kind === 'criteria' && (!summarized(check.actual) || evidence?.judgeEvidence?.length));
  const coverage = evidence && conversation?.length ? <ConversationScope turns={conversation} plannedTurns={selected!.utterances.length} truncated={evidence.conversationTruncated} /> : null;

  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [selected?.id, tab]);
  useEffect(() => {
    if (!opened && returnFocus.current) {
      rows.current.get(returnFocus.current)?.focus();
      returnFocus.current = null;
    }
    if (opened && root.current && root.current.clientWidth <= 760) heading.current?.focus();
  }, [opened, selected?.id]);

  function choose(c: ScenarioCase) { setSelectedId(c.id); setOpened(true); setTab('Result'); }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const index = shown.findIndex(c => rows.current.get(c.id) === event.target);
    if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? shown.length - 1 : Math.max(0, Math.min(shown.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    const c = shown[next]!;
    setSelectedId(c.id); setTab('Result'); rows.current.get(c.id)?.focus();
  }
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    setTab(tabs[index]!);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[index]?.focus();
  }

  return <div ref={setRoot} style={split.style} className={`sf-cases sf-tests-workspace${opened && selected ? ' has-selection' : ''}`} data-testid="tests-cases-workbench">
    <style>{TEST_CASES_STYLES}</style>
    <div className="sf-cases-catalogue">
      <div className="sf-cases-search">
        <input type="search" aria-label="Search cases" placeholder="Search cases…" value={query} onChange={e => { setQuery(e.target.value); setOpened(false); }} />
        <PopoverPicklist<CaseFilter> ariaLabel="Filter case results" triggerClassName="sf-cases-filter" value={filter} searchable={false} minWidth={180} onChange={value => { onFilterChange(value); setOpened(false); }} options={[
          { value: 'all', label: 'All results' }, { value: 'fail', label: 'Failed' }, { value: 'pass', label: 'Passed' },
          { value: 'stopped', label: 'Stopped' }, { value: 'not-run', label: 'Not run' }, { value: 'inconclusive', label: 'Needs review' }, { value: 'setup', label: 'Setup required' },
        ]} />
        <span className="sf-tp-sub" aria-live="polite">{shown.length} of {cases.length} cases</span>
      </div>
      <div className="sf-cases-rows" role="region" aria-label="Test case list" tabIndex={0} onKeyDown={navigate}>
        {shown.map(c => <button key={c.id} ref={el => { if (el) rows.current.set(c.id, el); else rows.current.delete(c.id); }} type="button" className="sf-cases-row" data-testid={`tests-row-${c.id}`} title={c.name} aria-label={`Details for ${c.name}`} aria-describedby={`${prefix}-status-${encodeURIComponent(c.id)}`} aria-pressed={selected?.id === c.id} aria-controls={`${prefix}-detail`} onClick={() => choose(c)}>
          <span className="sf-cases-row-title"><strong>{c.name}</strong><Badge id={`${prefix}-status-${encodeURIComponent(c.id)}`} status={statusOf(c)} /></span>
          <span className="sf-cases-opening">{c.utterances[0]}</span>
          <span className="sf-cases-meta">{c.utterances.length} {c.utterances.length === 1 ? 'turn' : 'turns'}{c.pinned && <span className="sf-tp-chip is-pinned" title={`Pinned from run ${c.pinned.runId}`}>Pinned</span>}{proposal && <span>Proposal: {proposal[c.id] ? LABEL[proposal[c.id]!] : 'Not run'}</span>}</span>
        </button>)}
        {!shown.length && <div className="sf-tp-empty">No matching cases. Try another search or result filter.<button type="button" className="sf-tp-btn" onClick={() => { setQuery(''); onFilterChange('all'); }}>Clear filters</button></div>}
      </div>
      <p className="sf-cases-hint">↑ ↓ to move between cases · Enter to open</p>
    </div>
    {split.divider('Resize case catalogue and details')}
    <section id={`${prefix}-detail`} className="sf-cases-detail" aria-label="Case details">
      {selected ? <>
        <header className="sf-cases-detail-head">
          <button type="button" className="sf-tp-btn sf-cases-back" onClick={() => { returnFocus.current = selected.id; setOpened(false); }}>← All cases</button>
          <div className="sf-cases-meta"><Badge status={status} /><span>Simulate · {selected.utterances.length} {selected.utterances.length === 1 ? 'turn' : 'turns'}</span><button type="button" className="sf-cases-remove" aria-label="Remove case" disabled={running || cases.length < 2} title={cases.length < 2 ? 'A suite keeps at least one case.' : 'Remove case'} onClick={() => props.onRemove(selected.id)}><Trash2 size={14} aria-hidden="true" /></button></div>
          <h3 ref={heading} tabIndex={-1}>{selected.name}</h3>
          <div className="sf-tp-bar"><button type="button" className="sf-tp-btn sf-cases-run is-primary" disabled={running || !sourceReady} onClick={() => props.onRun(selected.id)}>{status === 'running' ? 'Running…' : evidence ? 'Run case again' : 'Run case'}</button>
            {props.onFix && status === 'fail' && <button type="button" className="sf-tp-btn" onClick={() => props.onFix?.(selected)}>Fix this case</button>}
          </div>
          <div className="sf-cases-tabs" role="tablist" aria-label="Case detail" onKeyDown={navigateTabs}>{tabs.map(name => <button key={name} id={`${prefix}-${name}`} type="button" role="tab" aria-selected={tab === name} aria-controls={`${prefix}-content`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)}>{name}</button>)}</div>
        </header>
        <div ref={content} className="sf-cases-content" id={`${prefix}-content`} role="tabpanel" aria-labelledby={`${prefix}-${tab}`} tabIndex={0}>
          {tab === 'Variables' && props.renderVariables?.(selected)}
          {selected.prerequisites?.length ? <div className="sf-cases-callout"><strong>Setup required</strong><p>{selected.prerequisites.join('; ')}</p><label><input type="checkbox" checked={prepared.includes(selected.id)} onChange={e => props.onPreparedChange(selected.id, e.target.checked)} /> I prepared this case for this session</label><p className="sf-tp-sub">Message replay does not submit forms or complete asynchronous work. Simulated results do not prove live delivery.</p></div> : null}
          {tab === 'Result' && <>
            {status === 'stopped' ? <div className="sf-cases-callout is-stopped"><strong>This case was stopped</strong><p>You stopped the run before this case finished. There is no verdict for this attempt.</p></div>
              : pending ? <div className="sf-cases-callout"><strong>{status === 'running' ? 'This case is running' : 'Waiting to run'}</strong><p>The result will appear here when this attempt finishes.</p></div>
              : !evidence ? <div className="sf-cases-callout"><strong>This case has not run yet</strong><p>Run this case to see the agent’s reply and its assessment.</p></div>
              : <><div className={`sf-cases-callout is-${status}`}><strong>{LABEL[status]}</strong><p>{status === 'fail' && reason ? reason : status === 'inconclusive' ? reason || 'There was not enough evidence to reach a verdict. Review the checks or run this case again.' : status === 'setup' ? 'Prepare the required context before replaying this case.' : 'The recorded response met this case’s expectations.'}</p></div>
                {coverage}
                {assessment.length > 0 && <><h4>Assessment</h4><ul className="sf-cases-checks">{assessment.map(check => <li key={`${check.kind}:${check.target}`}><span className={`sf-cases-check-mark is-${check.state}`} aria-label={check.state === 'ok' ? 'Passed' : check.state === 'ko' ? 'Failed' : 'Not assessed'}>{check.state === 'ok' ? '✓' : check.state === 'ko' ? '✕' : '–'}</span><div><strong>AI assessment</strong>{!summarized(check.actual) && <p>{check.actual}</p>}{evidence.judgeEvidence?.length ? <ul aria-label="AI assessment evidence">{evidence.judgeEvidence.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}</div></li>)}</ul></>}
                {evidence.reply && <><h4>Agent reply</h4><p className="sf-cases-message">{evidence.reply}</p></>}
              </>}
            {(!evidence || status === 'stopped') && <><h4>Expected behavior</h4><p>{selected.expect.criteria || 'Open Expectations to see the checks configured for this case.'}</p></>}
            {status === 'stopped' && <><h4>What was saved?</h4><p>Completed cases keep their results. This attempt has no verdict.{conversation?.length ? ' Recorded messages are available in Conversation.' : ''}</p></>}
            {(lastEval || proposal) && <div className="sf-cases-secondary-results">
              {lastEval && <div><h4>Org eval{!lastEval.perCase ? ' (totals)' : ''}</h4><p>{lastEval.results[selected.id] ? LABEL[lastEval.results[selected.id]!.outcome] : 'No per-case result'} · {lastEval.org}</p>{selected.utterances.length > 1 && <p className="sf-tp-sub">{lastEval.historyReplay ? 'Final-turn replay with recorded history; earlier replies are fixed context.' : 'This older evaluation tested only the opening message.'} Use Simulate to rerun the entire conversation.</p>}</div>}
              {proposal && <div><h4>Proposal</h4><p>{proposal[selected.id] ? LABEL[proposal[selected.id]!] : 'Not run'} · These results are not saved.</p></div>}
            </div>}
            {evidence && status !== 'stopped' && <details className="sf-cases-technical"><summary><span>Run evidence</span>{technical.length > 0 && <span className="sf-cases-count">{technical.length} {technical.length === 1 ? 'check' : 'checks'}</span>}</summary><div className="sf-cases-disclosure-body">
              {technical.length > 0 && <ul className="sf-cases-checks">{technical.map(check => <li key={`${check.kind}:${check.target}`}><span className={`sf-cases-check-mark is-${check.state}`} aria-label={check.state === 'ok' ? 'Passed' : check.state === 'ko' ? 'Failed' : 'Not verified'}>{check.state === 'ok' ? '✓' : check.state === 'ko' ? '✕' : '–'}</span><div><strong>{check.expected}</strong><p>{check.actual}</p></div></li>)}</ul>}
              <dl className="sf-cases-facts"><div><dt>Deterministic checks</dt><dd>{evidence.deterministic ? LABEL[evidence.deterministic] : 'Not recorded'}</dd></div><div><dt>AI assessment</dt><dd>{evidence.judge ? LABEL[evidence.judge] : 'Not evaluated'}</dd></div><div><dt>Runtime trace</dt><dd>{evidence.observed?.traceComplete === false ? 'Incomplete' : evidence.observed?.traced ? 'Available' : 'Unavailable'}</dd></div>{evidence.latencyMs !== undefined && <div><dt>Maximum response time</dt><dd>{evidence.latencyMs} ms</dd></div>}</dl>
            </div></details>}
          </>}
          {tab === 'Conversation' && <>
            {coverage}
            {conversation?.length ? <>{conversation.map((turn, index) => <div className={`sf-cases-bubble is-${turn.role}`} key={index}><strong>{turn.role === 'user' ? 'Customer' : 'Agent'}</strong><p>{turn.message}</p></div>)}{evidence?.conversationTruncated && <p className="sf-tp-sub">This saved conversation was shortened to fit the storage limit.</p>}</>
              : evidence?.reply ? <><p className="sf-tp-sub">Only the final reply was saved for this older run.</p><div className="sf-cases-bubble is-agent"><strong>Agent · final reply</strong><p>{evidence.reply}</p></div></>
              : <div className="sf-cases-callout"><strong>No conversation recorded</strong><p>{pending ? 'Messages will appear once this case completes.' : status === 'stopped' ? 'The run stopped before a conversation was saved. Run this case again to record one.' : 'Run this case to record the customer and agent messages.'}</p></div>}
          </>}
          {tab === 'Expectations' && <>
            <h4>What a good response should do</h4><p>{selected.expect.criteria || (technical.length ? 'Meet the configured checks below.' : 'No expectations have been configured for this case.')}</p>
            <h4>Customer messages</h4><ol className="sf-cases-utterances">{selected.utterances.map((text, index) => <li key={index}>{text}</li>)}</ol>
            {technical.length > 0 && <details className="sf-cases-technical"><summary>Technical checks · {technical.length}</summary><ul>{technical.map(check => <li key={`${check.kind}:${check.target}`}>{check.expected}</li>)}</ul></details>}
          </>}
        </div>
        <footer className="sf-cases-footer"><span className="sf-tp-sub">{evidence ? `Last attempt: ${LABEL[status].toLowerCase()}` : 'No completed attempt'}</span>
          {props.onShowPath && <button type="button" className="sf-tp-btn" onClick={() => props.onShowPath?.(selected.id)}>Show path on graph</button>}
        </footer>
      </> : <p className="sf-tp-empty">Select a case to see its details.</p>}
    </section>
  </div>;
}

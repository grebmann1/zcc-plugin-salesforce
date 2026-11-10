import { useCallback, useEffect, useRef, useState } from 'react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import {
  ANALYTICS_PERIODS, DEFAULT_ANALYTICS_PERIOD, ORG_ANALYTICS_RPC, mergeInventory, summarizeAnalytics,
  type AnalyticsPeriod, type OrgAnalyticsOverview,
} from '../../../lib/org-analytics-contract.js';

type Call = (pluginId: string, method: string, args?: unknown) => Promise<unknown>;

const STYLES = `
.sf-analytics { display:flex; flex-direction:column; gap:12px; padding:12px; font-size:12px; color:var(--sf-text); overflow:auto; min-width:0; }
.sf-analytics h2 { margin:0; font-size:14px; }
.sf-analytics-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.sf-analytics select, .sf-analytics button { font:inherit; color:var(--sf-text); background:var(--sf-bg); border:1px solid var(--sf-border); border-radius:5px; padding:3px 8px; }
.sf-analytics button:focus-visible, .sf-analytics select:focus-visible { outline:2px solid var(--sf-accent); outline-offset:1px; }
.sf-analytics-chip { color:var(--sf-muted); border:1px dashed var(--sf-border); border-radius:10px; padding:1px 8px; }
.sf-analytics-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; margin:0; }
.sf-analytics-kpis > div { border:1px solid var(--sf-border); border-radius:6px; padding:8px; }
.sf-analytics-kpis dt { color:var(--sf-muted); } .sf-analytics-kpis dd { margin:2px 0 0; font-size:18px; }
.sf-analytics-kpis dd small { display:block; font-size:11px; color:var(--sf-muted); }
.sf-analytics table { border-collapse:collapse; width:100%; }
.sf-analytics th, .sf-analytics td { text-align:left; padding:5px 8px; border-bottom:1px solid var(--sf-border); }
.sf-analytics th { color:var(--sf-muted); font-weight:500; }
.sf-analytics .sf-analytics-muted { color:var(--sf-muted); margin:0; overflow-wrap:anywhere; }
.sf-analytics-trend { display:flex; align-items:flex-end; gap:2px; height:48px; }
.sf-analytics-trend i { flex:1; min-width:2px; max-width:24px; background:var(--sf-accent); border-radius:2px 2px 0 0; }
`;

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const NOT_RECORDED = 'Not recorded';

/** Fleet analytics from the org's Agentforce session tracing: sessions, interactions and outcomes per agent. */
export function AnalyticsView({ pluginId, projectId, visible, call = callPluginRpc as Call }: {
  pluginId: string; projectId?: string; visible: boolean; call?: Call;
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(DEFAULT_ANALYTICS_PERIOD);
  const [agent, setAgent] = useState('all');
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; text: string } | { status: 'done'; overview: OrgAnalyticsOverview }>({ status: 'loading' });
  /** Agent names of the org inventory; undefined while unread, null when it could not be read. */
  const [inventory, setInventory] = useState<string[] | null | undefined>(undefined);
  const seq = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const mine = ++seq.current;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const inv = await call(pluginId, 'agents.list', projectId ? { projectId } : {}) as { ok?: boolean; data?: { agents?: Array<{ name?: unknown }> } } | null;
        const names = inv && inv.ok !== false && Array.isArray(inv.data?.agents) ? inv.data!.agents!.map(row => row.name).filter((n): n is string => typeof n === 'string') : null;
        if (mine === seq.current) setInventory(names);
      } catch { if (mine === seq.current) setInventory(null); }
    })();
    try {
      const reply = await call(pluginId, ORG_ANALYTICS_RPC.overview, { ...(projectId ? { projectId } : {}), period, ...(refresh ? { refresh: true } : {}) }) as
        (OrgAnalyticsOverview | { ok: false; error?: string }) | null;
      if (mine !== seq.current) return;
      if (!reply || reply.ok === false) setState({ status: 'error', text: (reply && 'error' in reply && reply.error) || 'No response.' });
      else setState({ status: 'done', overview: reply });
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  }, [call, pluginId, projectId, period]);
  useEffect(() => { if (visible) void load(); return () => { ++seq.current; }; }, [visible, load]);

  let body;
  if (state.status === 'loading') body = <p className="sf-analytics-muted" role="status">Reading session analytics…</p>;
  else if (state.status === 'error') body = <p className="sf-analytics-muted" role="alert">Analytics could not be read: {state.text}</p>;
  else if (state.overview.state === 'unavailable') body = <p className="sf-analytics-muted" role="status" data-reason={state.overview.reason}>{state.overview.message}</p>;
  else {
    const overview = inventory ? { ...state.overview, agents: mergeInventory(state.overview.agents, inventory) } : state.overview;
    const known = overview.agents.some(row => row.agent === agent);
    const summary = summarizeAnalytics(overview, known ? agent : 'all');
    const peak = Math.max(1, ...summary.daily.map(day => day.sessions));
    body = <>
      <dl className="sf-analytics-kpis">
        <div><dt>Sessions</dt><dd>{summary.totals.sessions}</dd></div>
        <div><dt>Interactions</dt><dd>{summary.totals.interactions}</dd></div>
        <div><dt>Agents with sessions</dt><dd>{summary.totals.agentsWithData} of {summary.totals.agents}</dd></div>
        <div><dt>Escalation</dt><dd>{summary.escalation ? pct(summary.escalation.rate) : NOT_RECORDED}
          <small>{summary.escalation ? `${summary.escalation.escalated} of ${summary.escalation.recorded} sessions with a recorded outcome` : 'The org stored no end type for these sessions.'}</small></dd></div>
      </dl>
      {summary.daily.length > 0 ? <div className="sf-analytics-trend" role="img" aria-label={`Sessions per day, ${summary.daily.length} days`}>
        {summary.daily.map(day => <i key={day.day} title={`${day.day}: ${day.sessions}`} style={{ height: `${(day.sessions / peak) * 100}%` }} />)}</div>
        : <p className="sf-analytics-muted">No sessions started in this window.</p>}
      <table><thead><tr><th>Agent</th><th>Sessions</th><th>Interactions</th><th>Per session</th><th>Escalated</th></tr></thead><tbody>
        {summary.agents.map(row => <tr key={row.agent}><td>{row.agent}</td>
          <td>{row.sessions > 0 ? row.sessions : 'No sessions'}</td><td>{row.sessions === 0 ? '—' : row.interactions > 0 ? row.interactions : 'None recorded'}</td>
          <td>{row.interactionsPerSession === null ? '—' : row.interactionsPerSession.toFixed(1)}</td>
          <td>{row.sessions === 0 ? '—' : row.escalated === null ? NOT_RECORDED : `${row.escalated} of ${row.recorded}`}</td></tr>)}</tbody></table>
      {summary.agents.length === 0 && <p className="sf-analytics-muted">No agent matches this filter.</p>}
      {overview.truncated && <p className="sf-analytics-muted" role="status">The answer was cut at its size bound; figures cover only what was read.</p>}
      {inventory === null && <p className="sf-analytics-muted">Agents without sessions are not listed: the org agent list could not be read.</p>}
      <p className="sf-analytics-muted">Window from {new Date(overview.since).toLocaleString()} · read {new Date(overview.at).toLocaleString()}</p>
    </>;
  }
  const agents = state.status === 'done' && state.overview.state === 'ready' ? state.overview.agents.map(row => row.agent) : [];
  return <section className="sf-analytics" aria-label="Analytics" data-testid="studio-analytics"><style>{STYLES}</style>
    <h2>Analytics</h2>
    <div className="sf-analytics-bar">
      <label>Period <select value={period} onChange={event => setPeriod(event.target.value as AnalyticsPeriod)}>{ANALYTICS_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
      <label>Agent <select value={agent} onChange={event => setAgent(event.target.value)}><option value="all">All agents</option>{agents.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <span className="sf-analytics-chip" title="Sessions are recorded per agent API name only.">Version and environment: unavailable</span>
      <button type="button" onClick={() => void load(true)}>Refresh</button>
    </div>
    {body}
  </section>;
}

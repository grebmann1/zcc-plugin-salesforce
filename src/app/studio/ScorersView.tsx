import { useCallback, useEffect, useRef, useState } from 'react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import { ORG_TESTS_RPC, type OrgRunRecord, type OrgRunResults } from '../../../lib/org-tests-contract.js';
import { agentNameFromPath } from './org-tests-model.js';
import { failingCases, percent, scorerRows, scorerTrends } from './scorers-model.js';

type Call = (pluginId: string, method: string, args?: unknown) => Promise<unknown>;
type Reply = { ok?: boolean; error?: string; runs?: unknown; run?: unknown };
/** Completed runs read for the comparison; each is one org read. */
export const SCORER_RUN_WINDOW = 6;

const STYLES = `
.sf-scorers { display:flex; flex-direction:column; gap:10px; padding:10px; font-size:12px; color:var(--sf-text); overflow:auto; }
.sf-scorers h2 { margin:0; font-size:14px; }
.sf-scorers table { border-collapse:collapse; width:100%; }
.sf-scorers th, .sf-scorers td { text-align:left; padding:5px 8px; border-bottom:1px solid var(--sf-border); }
.sf-scorers th { color:var(--sf-muted); font-weight:500; }
.sf-scorers .sf-scorers-note { color:var(--sf-muted); margin:0; overflow-wrap:anywhere; }
.sf-scorers .sf-scorers-up { color:var(--sf-success); } .sf-scorers .sf-scorers-down { color:var(--sf-danger); }
.sf-scorers button { font:inherit; color:var(--sf-accent); background:transparent; border:0; cursor:pointer; padding:0; }
.sf-scorers button:focus-visible { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-scorers ul { margin:4px 0 0 16px; padding:0; }
`;

/** Scorer results of the org's Testing Center runs for the open agent: latest run, change since the previous run, failing cases. */
export function ScorersView({ pluginId, projectId, path, visible, call = callPluginRpc as Call }: {
  pluginId: string; projectId?: string; path: string | null; visible: boolean; call?: Call;
}) {
  const agent = agentNameFromPath(path);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; runs: OrgRunResults[] }>({ status: 'loading' });
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState({ status: 'loading' });
    const rpc = async (method: string, args: Record<string, unknown> = {}) =>
      (await call(pluginId, method, { ...(projectId ? { projectId } : {}), ...args }) as Reply | null) ?? { ok: false, error: 'No response.' };
    try {
      const list = await rpc(ORG_TESTS_RPC.runs);
      if (list.ok === false || !Array.isArray(list.runs)) throw new Error(list.error || 'Could not read the org test runs.');
      const records = (list.runs as OrgRunRecord[])
        .filter(run => run.status === 'completed' && (!agent || (run.subjectName ?? '').toLowerCase() === agent.toLowerCase()))
        .slice(0, SCORER_RUN_WINDOW);
      const results = await Promise.all(records.map(async record => {
        const reply = await rpc(ORG_TESTS_RPC.run, { runId: record.runId });
        return reply.ok === false || !reply.run ? null : reply.run as OrgRunResults;
      }));
      if (mine === seq.current) setState({ status: 'ready', runs: results.filter((run): run is OrgRunResults => run !== null) });
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  }, [agent, call, pluginId, projectId]);
  useEffect(() => { if (visible) void load(); return () => { ++seq.current; }; }, [visible, load]);

  let body;
  if (state.status === 'loading') body = <p className="sf-scorers-note" role="status">Reading scorer results…</p>;
  else if (state.status === 'error') body = <p className="sf-scorers-note" role="alert">Scorers unavailable: {state.text} <button type="button" onClick={() => void load()}>Retry</button></p>;
  else if (!state.runs.length) body = <p className="sf-scorers-note">{agent ? `No completed org test runs for ${agent} yet.` : 'No completed org test runs yet.'} Run an org test to see its scorers.</p>;
  else {
    const latest = [...state.runs].sort((a, b) => b.startedAt - a.startedAt)[0]!;
    const trends = new Map(scorerTrends(state.runs).map(trend => [trend.name, trend]));
    const rows = scorerRows(latest);
    body = <>
      <p className="sf-scorers-note">Latest run {latest.definition} · {new Date(latest.startedAt).toLocaleString()} · compared with {state.runs.length - 1} earlier run{state.runs.length === 2 ? '' : 's'}.</p>
      {rows.length ? <table><thead><tr><th>Scorer</th><th>Pass rate</th><th>Passed</th><th>Failed</th><th>Not computed</th><th>Avg score</th><th>Change</th></tr></thead><tbody>
        {rows.map(row => {
          const delta = trends.get(row.name)?.delta ?? null;
          const failing = open === row.name ? failingCases(latest, row.name) : [];
          return <tr key={row.name}><td>{row.fail > 0 ? <button type="button" aria-expanded={open === row.name} onClick={() => setOpen(open === row.name ? null : row.name)}>{row.label}</button> : row.label}
            {failing.length > 0 && <ul aria-label={`${row.label} failures`}>{failing.map(item => <li key={item.number}>#{item.number} {item.utterance}</li>)}</ul>}</td>
            <td>{row.rate === null ? (row.averageScore !== null ? 'Score only' : 'Not scored') : percent(row.rate)}</td><td>{row.pass}</td><td>{row.fail}</td><td>{row.errors}</td>
            <td>{row.averageScore === null ? 'Not scored' : row.averageScore.toFixed(2)}</td>
            <td className={delta === null ? undefined : delta >= 0 ? 'sf-scorers-up' : 'sf-scorers-down'}>{delta === null ? 'No earlier run' : `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} pts`}</td></tr>;
        })}</tbody></table> : <p className="sf-scorers-note">This run reported no scorer results.</p>}
    </>;
  }
  return <section className="sf-scorers" aria-label="Scorers" data-testid="studio-scorers"><style>{STYLES}</style><h2>Scorers</h2>{body}</section>;
}

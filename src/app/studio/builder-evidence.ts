import type { CaseResult, ScenarioSuite } from '../../../lib/studio-contract.js';
import type { LabSnapshot } from '../../../lib/agentforce-lab-contract.js';
import type { BuilderScorer } from '../../../lib/studio-builder-contract.js';
export function sessionMode(session: Pick<LabSnapshot, 'engine' | 'live'>) {
  return session.engine === 'rehearsal' ? 'Rehearse' : session.live ? 'Live' : 'Simulate';
}
export function sessionTitle(session: Pick<LabSnapshot, 'id' | 'engine' | 'live' | 'scenario'>) {
  return session.scenario?.goal || `${sessionMode(session)} · ${session.id.slice(0, 8)}`;
}
/** Summary-only list responses omit scenario and transcript. Search their actual metadata. */
export function sessionSearchText(session: Pick<LabSnapshot, 'id' | 'engine' | 'live' | 'scenario' | 'orgAlias' | 'createdAt'>) {
  const date = session.createdAt ? new Date(session.createdAt) : null;
  return `${sessionTitle(session)} ${session.id} ${session.orgAlias} ${date?.toLocaleString() ?? ''} ${date?.toISOString() ?? ''}`;
}
export interface EvidenceRow { id: string; name: string; suite: string; caseId: string; result: CaseResult }
export interface ScorerCheckSummary extends BuilderScorer { revision: number; total: number; pass: number; fail: number; inconclusive: number }
export function savedEvidence(suites: ScenarioSuite[]): EvidenceRow[] {
  return suites.flatMap(suite => suite.cases.flatMap(item => {
    const result = suite.lastResults?.[item.id];
    return result ? [{ id: `${suite.id}:${item.id}`, name: item.name, suite: suite.path, caseId: item.id, result }] : [];
  })).sort((a, b) => b.result.at - a.result.at);
}
export function evidenceSummary(rows: EvidenceRow[], sessions: LabSnapshot[]) {
  const pass = rows.filter(row => row.result.outcome === 'pass' && !row.result.stopped).length;
  const fail = rows.filter(row => row.result.outcome === 'fail' && !row.result.stopped).length;
  const latencies = rows.flatMap(row => row.result.latencyMs === undefined ? [] : [row.result.latencyMs]).sort((a, b) => a - b);
  const actions = new Map<string, number>();
  for (const row of rows) for (const action of new Set(row.result.observed?.actions ?? [])) actions.set(action, (actions.get(action) ?? 0) + 1);
  const scorerChecks = new Map<string, ScorerCheckSummary>();
  for (const row of rows) {
    const evaluation = row.result.scorerEvaluation;
    if (!evaluation) continue;
    for (const check of evaluation.checks) {
      const { outcome, ...rule } = check;
      const key = JSON.stringify([evaluation.revision, rule.id, rule.name, rule.kind, rule.value]);
      const summary = scorerChecks.get(key) ?? { ...rule, revision: evaluation.revision, total: 0, pass: 0, fail: 0, inconclusive: 0 };
      summary.total++;
      summary[row.result.stopped || row.result.setupBlocked ? 'inconclusive' : outcome]++;
      scorerChecks.set(key, summary);
    }
  }
  return { total: rows.length, pass, fail, inconclusive: rows.length - pass - fail, passRate: rows.length ? Math.round(pass / rows.length * 100) : null,
    medianLatency: latencies.length ? (latencies[Math.floor((latencies.length - 1) / 2)] + latencies[Math.floor(latencies.length / 2)]) / 2 : null,
    sessions: sessions.length, actions: [...actions].sort((a, b) => b[1] - a[1]), scorerChecks: [...scorerChecks.values()].sort((a, b) => b.revision - a.revision || a.name.localeCompare(b.name)) };
}

import { expect, it } from 'vitest';
import type { ScenarioSuite } from '../../../lib/studio-contract.js';
import { evidenceSummary, savedEvidence, sessionMode, sessionTitle, sessionSearchText } from './builder-evidence.js';
it('uses retained session metadata without assuming a transcript or scenario was listed', () => {
  const summary = { id: '12345678-rest-of-id', engine: 'rehearsal' as const, live: true, orgAlias: 'dev', createdAt: new Date('2026-11-02T10:15:00Z').getTime() };
  expect(sessionMode(summary)).toBe('Rehearse');
  expect(sessionTitle(summary)).toBe('Rehearse · 12345678');
  expect(sessionSearchText(summary)).toContain('2026-11-02T10:15:00.000Z');
  expect(sessionSearchText({ ...summary, createdAt: undefined })).toContain('12345678-rest-of-id dev');
  expect(sessionMode({ engine: 'preview', live: true })).toBe('Live');
  expect(sessionMode({ engine: 'preview' })).toBe('Simulate');
  expect(sessionTitle({ ...summary, scenario: { persona: '', opening: '', criteria: '', maxTurns: 1, goal: 'Recorded scenario' } })).toBe('Recorded scenario');
});
it('summarizes latest case evidence without inferring a pass from missing or stopped results', () => {
  const suites: ScenarioSuite[] = [{ id: 's', path: 's.json', cases: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, utterances: [], expect: {} })), lastResults: { a: { at: 10, runId: 'a', outcome: 'pass', latencyMs: 100, observed: { traced: true, topics: [], actions: ['Lookup', 'Lookup'] } }, b: { at: 20, runId: 'b', outcome: 'fail', latencyMs: 200 }, c: { at: 30, runId: 'c', outcome: 'fail', stopped: true } } }, { id: 'empty', path: 'empty', cases: [{ id: 'a', name: 'a', utterances: [], expect: {} }] }];
  const rows = savedEvidence(suites); expect(rows.map(row => row.caseId)).toEqual(['c', 'b', 'a']);
  expect(evidenceSummary(rows, [])).toMatchObject({ total: 3, pass: 1, fail: 1, inconclusive: 1, passRate: 33, medianLatency: 150, actions: [['Lookup', 1]] });
  expect(evidenceSummary([], [])).toMatchObject({ passRate: null, medianLatency: null });

});
it('summarizes stored scorer decisions by their pinned rule and revision without recomputing history', () => {
  const rule = { id: 'policy', name: 'Refund policy', kind: 'contains' as const, value: 'refund' };
  const result = (outcome: 'pass' | 'fail' | 'inconclusive', revision = 4) => ({ outcome, runId: 'r', at: 1, reply: 'This text would not pass the stored rule', scorerEvaluation: { revision, baseOutcome: 'pass' as const, checks: [{ ...rule, outcome }] } });
  const rows = [result('pass'), result('fail'), result('inconclusive'), result('pass', 5), { ...result('pass'), stopped: true }, { ...result('pass'), setupBlocked: true }, { outcome: 'pass' as const, runId: 'legacy', at: 1 }].map((result, index) => ({ id: String(index), name: 'Case', suite: 's', caseId: String(index), result }));
  const summary = evidenceSummary(rows, []);
  expect(summary.scorerChecks).toEqual([
    { ...rule, revision: 5, total: 1, pass: 1, fail: 0, inconclusive: 0 },
    { ...rule, revision: 4, total: 5, pass: 1, fail: 1, inconclusive: 3 },
  ]);
  expect(evidenceSummary([], []).scorerChecks).toEqual([]);
});
it('keeps distinct pinned rules and names separate even when a revision or rule id matches', () => {
  const checks = [
    { id: 'policy', name: 'Z policy', kind: 'contains' as const, value: 'refund', outcome: 'pass' as const },
    { id: 'policy', name: 'A policy', kind: 'contains' as const, value: 'returns', outcome: 'fail' as const },
  ];
  const rows = [{ id: 'a', name: 'Case', suite: 's', caseId: 'a', result: { at: 1, runId: 'r', outcome: 'fail' as const, scorerEvaluation: { revision: 2, baseOutcome: 'pass' as const, checks } } }];
  expect(evidenceSummary(rows, []).scorerChecks.map(row => [row.name, row.value, row.pass, row.fail])).toEqual([['A policy', 'returns', 0, 1], ['Z policy', 'refund', 1, 0]]);
});

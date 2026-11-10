import { describe, expect, it } from 'vitest';
import { failingCases, percent, scorerRows, scorerTrends } from './scorers-model.js';
import type { OrgCaseResult, OrgRunResults } from '../../../lib/org-tests-contract.js';

const kase = (n: number, metrics: OrgCaseResult['metrics']): OrgCaseResult => ({ number: n, utterance: `u${n}`, status: 'completed', actions: [], metrics, verdict: 'pass' });
const run = (id: string, startedAt: number, cases: OrgCaseResult[], status: OrgRunResults['status'] = 'completed'): OrgRunResults =>
  ({ runId: id, definition: 'D', orgId: 'o', orgAlias: 'a', status, startedAt, startedBy: 'studio', cases });

describe('scorerRows', () => {
  it('counts decided, errored and scored-only metrics without inventing rates', () => {
    const rows = scorerRows(run('r', 1, [
      kase(1, [{ name: 'topic_sequence_match', result: 'pass' }, { name: 'completeness', result: null, score: 4 }]),
      kase(2, [{ name: 'topic_sequence_match', result: 'fail', score: 0 }, { name: 'completeness', result: null, score: 2 }, { name: 'latency', result: null, error: 'x', score: 9 }]),
      kase(3, [{ name: 'topic_sequence_match', result: 'pass' }]),
    ]));
    const topic = rows.find(r => r.name === 'topic_sequence_match')!;
    expect(topic).toMatchObject({ cases: 3, pass: 2, fail: 1, errors: 0, label: 'Topic' });
    expect(topic.rate).toBeCloseTo(2 / 3);
    expect(topic.averageScore).toBe(0);
    expect(rows.find(r => r.name === 'completeness')).toMatchObject({ rate: null, averageScore: 3 });
    expect(rows.find(r => r.name === 'latency')).toMatchObject({ errors: 1, rate: null, averageScore: null });
    expect(scorerRows(run('e', 1, []))).toEqual([]);
  });
});

describe('scorerTrends', () => {
  it('orders completed runs and reports the latest change', () => {
    const trends = scorerTrends([
      run('b', 20, [kase(1, [{ name: 'a_m', result: 'pass' }, { name: 'a_m', result: 'pass' }])]),
      run('a', 10, [kase(1, [{ name: 'a_m', result: 'pass' }, { name: 'a_m', result: 'fail' }, { name: 'only_old', result: 'pass' }])]),
      run('c', 30, [kase(1, [{ name: 'a_m', result: 'pass' }])], 'in_progress'),
    ]);
    const t = trends.find(x => x.name === 'a_m')!;
    expect(t.points.map(p => p.runId)).toEqual(['a', 'b']);
    expect(t.delta).toBeCloseTo(0.5);
    const old = trends.find(x => x.name === 'only_old')!;
    expect(old.points[1]).toMatchObject({ rate: null });
    expect(old.delta).toBeNull();
    expect(scorerTrends([])).toEqual([]);
  });
});

it('finds failing cases and formats rates', () => {
  const r = run('r', 1, [kase(1, [{ name: 'm', result: 'fail' }]), kase(2, [{ name: 'm', result: 'pass' }]), kase(3, [{ name: 'm', result: null, error: 'x' }])]);
  expect(failingCases(r, 'm').map(c => c.number)).toEqual([1]);
  expect(percent(0.756)).toBe('76%');
  expect(percent(null)).toBe('Not scored');
});

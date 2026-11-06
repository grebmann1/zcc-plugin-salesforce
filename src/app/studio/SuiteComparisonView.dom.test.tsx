/** @vitest-environment happy-dom */
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { comparisonSummary, SuiteComparisonView } from './SuiteComparisonView.js';
import type { CaseOutcome, CaseResult, SuiteComparison } from '../../../lib/studio-contract.js';
afterEach(cleanup);
const row = (outcome: CaseOutcome, extra = {}): CaseResult => ({ outcome, at: 1, runId: 'r', ...extra });
it('distinguishes improvements, regressions, unchanged failures and uncertain comparisons', () => {
  const comparison: SuiteComparison = { referenceHash: 'same', candidateHash: 'same', suiteHash: 's', at: 1,
    reference: { a: row('fail'), b: row('pass'), c: row('inconclusive'), d: row('pass'), e: row('fail') },
    candidate: { a: row('pass'), b: row('fail'), c: row('pass'), e: row('fail') } };
  expect(comparisonSummary(comparison)).toEqual({ total: 5, improved: 1, regressed: 1, unclear: 2, referencePass: 2, candidatePass: 2 });
  render(<SuiteComparisonView comparison={comparison} cases={[]} stale={false} />);
  expect(screen.getByText(/Both sources are identical/)).toBeTruthy();
  expect(screen.getByLabelText('d: pass → inconclusive')).toBeTruthy();
  expect(screen.getAllByText('No reply recorded').length).toBe(10);
  expect(screen.queryByText(/editor or cases changed/)).toBeNull();
});


it('presents recorded actions, latency, notes and stale evidence without using the fix-loop surface', () => {
  const comparison: SuiteComparison = { referenceHash: 'abcdefghijklmnop', candidateHash: 'qrs', suiteHash: 's', at: 1,
    reference: { a: row('fail', { reply: 'Saved reply', latencyMs: 0, observed: { actions: ['Lookup'], topics: [], traced: true }, notes: ['Missing policy'] }) },
    candidate: { a: row('pass', { reply: 'Draft reply', latencyMs: 145 }) } };
  const { container } = render(<SuiteComparisonView comparison={comparison} cases={[{ id: 'a', name: 'Refund eligibility', utterances: ['Refund please'], expect: {} }]} stale />);
  expect(screen.getByLabelText('Refund eligibility: fail → pass')).toBeTruthy();
  expect(screen.getByText('Saved reply')).toBeTruthy();
  expect(screen.getByText('Draft reply')).toBeTruthy();
  expect(screen.getByText('Lookup')).toBeTruthy();
  expect(screen.getByText('0 ms')).toBeTruthy();
  expect(screen.getByText('145 ms')).toBeTruthy();
  expect(screen.getByText('Missing policy')).toBeTruthy();
  expect(screen.getByText(/editor or cases changed/)).toBeTruthy();
  expect(screen.queryByText(/Both sources are identical/)).toBeNull();
  expect(screen.getByText('Reference abcdefghijkl · Candidate qrs')).toBeTruthy();
  expect(container.querySelector('.sf-tp-loop')).toBeNull();
});

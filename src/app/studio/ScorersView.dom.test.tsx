// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScorersView } from './ScorersView.js';

afterEach(cleanup);
const run = (id: string, at: number, metrics: unknown[], extra = {}) => ({ runId: id, definition: 'Def', subjectName: 'Svc', status: 'completed', startedAt: at, startedBy: 'studio', orgId: 'o', orgAlias: 'a',
  cases: [{ number: 1, utterance: 'refund please', status: 'completed', actions: [], metrics, verdict: 'fail' }], ...extra });
const PATH = 'force-app/main/default/aiAuthoringBundles/Svc/Svc.agent';
function caller(runs: any[], results: Record<string, any>) {
  return vi.fn(async (_p: string, method: string, args: any) => method === 'studio.orgTests.runs' ? { ok: true, runs } : results[args.runId] ? { ok: true, run: results[args.runId] } : { ok: false });
}

describe('ScorersView', () => {
  it('shows the latest run, the change and the failing cases', async () => {
    const call = caller(
      [{ runId: 'b', status: 'completed', subjectName: 'svc' }, { runId: 'a', status: 'completed', subjectName: 'Svc' }, { runId: 'x', status: 'completed', subjectName: 'Other' }, { runId: 'p', status: 'in_progress', subjectName: 'Svc' }],
      { a: run('a', 1, [{ name: 'topic_sequence_match', result: 'pass' }]), b: run('b', 2, [{ name: 'topic_sequence_match', result: 'fail' }, { name: 'completeness', result: null, score: 3 }]) },
    );
    render(<ScorersView pluginId="salesforce" path={PATH} visible call={call as never} />);
    expect(await screen.findByText('-100 pts')).toBeTruthy();
    expect(screen.getAllByText('Not scored')).toHaveLength(2);
    expect(screen.getByText('3.00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Topic' }));
    expect(screen.getByLabelText('Topic failures').textContent).toContain('refund please');
    expect(call.mock.calls.filter(c => c[1] === 'studio.orgTests.run.get')).toHaveLength(2);
  });
  it('says so when there are no runs, a run has no scorers, or the read fails', async () => {
    const { unmount } = render(<ScorersView pluginId="salesforce" path={PATH} visible call={caller([], {}) as never} />);
    expect(await screen.findByText(/No completed org test runs for Svc/)).toBeTruthy();
    unmount();
    render(<ScorersView pluginId="salesforce" path={null} visible call={caller([{ runId: 'a', status: 'completed' }], { a: run('a', 1, []) }) as never} />);
    expect(await screen.findByText(/reported no scorer results/)).toBeTruthy();
    cleanup();
    const failing = vi.fn(async () => ({ ok: false, error: 'org down' }));
    render(<ScorersView pluginId="salesforce" path={PATH} visible call={failing as never} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(failing.mock.calls.length).toBeGreaterThan(1));
  });
  it('reads nothing while hidden', () => {
    const call = caller([], {});
    render(<ScorersView pluginId="salesforce" path={PATH} visible={false} call={call as never} />);
    expect(call).not.toHaveBeenCalled();
  });
});

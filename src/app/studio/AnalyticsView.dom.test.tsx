// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsView } from './AnalyticsView.js';

afterEach(cleanup);
const ready = (extra = {}) => ({ ok: true, state: 'ready', org: 'dev', period: '7d', since: '2026-11-03T00:00:00Z', at: '2026-11-10T00:00:00Z', truncated: false,
  agents: [
    { agent: 'A', sessions: 90, interactions: 180, interactionsPerSession: 2, recorded: 90, escalated: 0 },
    { agent: 'B', sessions: 2, interactions: 4, interactionsPerSession: 2, recorded: 2, escalated: 2 },
    { agent: 'Idle', sessions: 0, interactions: 0, interactionsPerSession: null, recorded: 0, escalated: null },
  ],
  daily: [{ agent: 'A', day: '2026-11-08', sessions: 90 }, { agent: 'B', day: '2026-11-09', sessions: 2 }], totals: {}, escalation: null, ...extra });

describe('AnalyticsView', () => {
  it('shows weighted escalation, no-data agents and the unavailable version filter', async () => {
    const call = vi.fn(async () => ready());
    render(<AnalyticsView pluginId="salesforce" visible call={call as never} />);
    expect(await screen.findByText('2.2%')).toBeTruthy();
    expect(screen.getByText('No sessions')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Idle' })).toBeTruthy();
    expect(screen.getByText(/Version and environment: unavailable/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Sessions per day, 2 days/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'B' } });
    expect(screen.getByText('100.0%')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'Idle' } });
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(screen.getByText('No sessions started in this window.')).toBeTruthy();
  });
  it('lists inventory agents without sessions, and says when the inventory is unreadable', async () => {
    const call = vi.fn(async (_p: string, method: string) => method === 'agents.list' ? { ok: true, data: { agents: [{ name: 'a' }, { name: 'Zed_Agent' }, { name: 7 }] } } : ready());
    render(<AnalyticsView pluginId="salesforce" visible call={call as never} />);
    expect(await screen.findByRole('cell', { name: 'Zed_Agent' })).toBeTruthy();
    expect(screen.queryByText(/could not be read/)).toBeNull();
    cleanup();
    render(<AnalyticsView pluginId="salesforce" visible call={(async (_p: string, method: string) => { if (method === 'agents.list') throw new Error('x'); return ready(); }) as never} />);
    expect(await screen.findByText(/org agent list could not be read/)).toBeTruthy();
  });
  it('says none recorded when sessions have no interaction records', async () => {
    const call = vi.fn(async () => ready({ agents: [{ agent: 'A', sessions: 5, interactions: 0, interactionsPerSession: null, recorded: 0, escalated: null }] }));
    render(<AnalyticsView pluginId="salesforce" visible call={call as never} />);
    expect(await screen.findByText('None recorded')).toBeTruthy();
  });
  it('reports not recorded instead of zero, and truncation', async () => {
    const call = vi.fn(async () => ready({ truncated: true, agents: [{ agent: 'A', sessions: 5, interactions: 5, interactionsPerSession: 1, recorded: 0, escalated: null }] }));
    render(<AnalyticsView pluginId="salesforce" visible call={call as never} />);
    expect((await screen.findAllByText('Not recorded')).length).toBe(2);
    expect(screen.getByText(/cut at its size bound/)).toBeTruthy();
  });
  it('re-reads on period change and refresh, and states unavailable and error cases', async () => {
    const call = vi.fn(async () => ready());
    render(<AnalyticsView pluginId="salesforce" projectId="p" visible call={call as never} />);
    await screen.findByText('2.2%');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '30d' } });
    await waitFor(() => expect(call).toHaveBeenLastCalledWith('salesforce', 'studio.analytics.overview', { projectId: 'p', period: '30d' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(call).toHaveBeenLastCalledWith('salesforce', 'studio.analytics.overview', { projectId: 'p', period: '30d', refresh: true }));
    cleanup();
    render(<AnalyticsView pluginId="salesforce" visible call={(async () => ({ ok: true, state: 'unavailable', reason: 'no_data_360', message: 'Data 360 is off.', period: '7d' })) as never} />);
    expect((await screen.findByRole('status')).getAttribute('data-reason')).toBe('no_data_360');
    cleanup();
    render(<AnalyticsView pluginId="salesforce" visible call={(async () => ({ ok: false, error: 'refused' })) as never} />);
    expect((await screen.findByRole('alert')).textContent).toContain('refused');
    cleanup();
    render(<AnalyticsView pluginId="salesforce" visible call={(async () => { throw new Error('boom'); }) as never} />);
    expect((await screen.findByRole('alert')).textContent).toContain('boom');
    cleanup();
    render(<AnalyticsView pluginId="salesforce" visible call={(async () => null) as never} />);
    expect((await screen.findByRole('alert')).textContent).toContain('No response');
  });
  it('reads nothing while hidden', () => {
    const call = vi.fn();
    render(<AnalyticsView pluginId="salesforce" visible={false} call={call as never} />);
    expect(call).not.toHaveBeenCalled();
  });
});

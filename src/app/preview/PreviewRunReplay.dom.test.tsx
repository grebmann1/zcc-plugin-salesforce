/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PreviewRunReplay } from './PreviewRunReplay.js';

const rpc = vi.fn();
const base = { id: 'r', engine: 'preview', orgAlias: 'dev', sourceHash: 'h', model: 'm', closed: false, failed: false };
beforeEach(() => {
  rpc.mockReset();
  (globalThis as Record<string, unknown>).__ZCC_PLUGIN_HOST__ = { callRpc: (_id: string, method: string, args: unknown) => rpc(method, args) };
});
afterEach(() => { cleanup(); delete (globalThis as Record<string, unknown>).__ZCC_PLUGIN_HOST__; });
const mount = (extra: Partial<Parameters<typeof PreviewRunReplay>[0]> = {}) =>
  render(<PreviewRunReplay pluginId="salesforce" runId="r" onClose={vi.fn()} {...extra} />);

describe('PreviewRunReplay', () => {
  it('validates command ownership/reply before rendering transcript or fetching trace', async () => {
    rpc.mockResolvedValueOnce({ ok: true, data: { ...base, path: 'Other.agent', turns: [{ role: 'agent', text: 'Private reply', planId: 'private-plan' }] } });
    const view = mount({ expectedPath: 'Help.agent', turn: 1 });
    expect((await screen.findByRole('alert')).textContent).toContain('does not belong');
    expect(screen.queryByText('Private reply')).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce({ ok: true, data: { ...base, path: 'Help.agent', turns: [{ role: 'agent', text: 'Welcome', planId: 'p' }] } });
    view.rerender(<PreviewRunReplay pluginId="salesforce" projectId="p2" runId="r" expectedPath="Help.agent" turn={9} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('reply is unavailable');
    expect(screen.queryByText('Welcome')).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('honors zero/latest and an exact step, clearing stale content on project/run changes', async () => {
    let finishOld!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const view = mount({ expectedPath: 'Old.agent', projectId: 'old', turn: 1, step: 0 });
    rpc.mockImplementation(async (method, args) => method === 'agentLab.get'
      ? { ok: true, data: { ...base, id: 'new', live: true, path: 'New.agent', turns: [{ role: 'agent', text: 'A', planId: 'a' }, { role: 'agent', text: 'B', planId: 'b' }] } }
      : { ok: true, data: { runId: args.id, turn: args.turn, planId: args.planId, available: true, steps: [{ kind: 'response', label: 'Exact step', outputPreview: 'B' }] } });
    view.rerender(<PreviewRunReplay pluginId="salesforce" projectId="new" runId="new" expectedPath="New.agent" turn={0} step={0} onClose={vi.fn()} />);
    expect(await screen.findByText('Live run')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Exact step').closest('[role=listitem]')?.getAttribute('aria-current')).toBe('step'));
    expect(rpc).toHaveBeenCalledWith('agentLab.trace', { projectId: 'new', id: 'new', planId: 'b', turn: 2, path: 'New.agent' });
    await act(async () => finishOld({ ok: true, data: { ...base, path: 'Old.agent', turns: [{ role: 'agent', text: 'Old secret', planId: 'old' }] } }));
    expect(screen.queryByText('Old secret')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Turn 1' }));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('agentLab.trace', expect.objectContaining({ planId: 'a', turn: 1 })));
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    expect(rpc.mock.calls.every(([, args]) => !args.includeSource)).toBe(true);
  });

  it('rejects a response for the wrong run ID', async () => {
    rpc.mockResolvedValue({ ok: true, data: { ...base, id: 'other', path: 'Help.agent', turns: [{ role: 'agent', text: 'Hidden', planId: 'p' }] } });
    mount({ expectedPath: 'Help.agent', turn: 1 });
    expect((await screen.findByRole('alert')).textContent).toContain('requested run is unavailable');
    expect(screen.queryByText('Hidden')).toBeNull();
  });
  it('labels a rehearse run as an approximation and never asks for a trace', async () => {
    rpc.mockResolvedValue({ ok: true, data: { ...base, engine: 'rehearsal', failed: true, turns: [{ role: 'user', text: 'Hi' }, { role: 'agent', text: 'Hello' }] } });
    mount();
    expect(screen.getByRole('status').textContent).toContain('Loading run…');
    expect(await screen.findByText('Rehearse run')).toBeTruthy();
    expect(screen.getByText('Stopped')).toBeTruthy();
    expect(screen.getByTestId('sf-trace').textContent).toMatch(/Approximation/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('agentLab.get', { id: 'r' });
  });

  it('clamps a stale turn to the latest reply and says when it has no plan', async () => {
    rpc.mockResolvedValue({ ok: true, data: { ...base, turns: [{ role: 'agent', text: 'Welcome' }] } });
    mount({ turn: 9, projectId: 'p' });
    expect(await screen.findByText('Still open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn 1' }).getAttribute('aria-pressed')).toBe('true');
    expect((await screen.findByTestId('sf-trace')).textContent).toContain('no plan to trace');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('shows an empty run, and a failed trace request as an unavailable trace', async () => {
    rpc.mockResolvedValueOnce({ ok: true, data: { ...base, turns: [] } });
    const first = mount();
    expect(await screen.findByText('This run has no turns yet.')).toBeTruthy();
    expect(screen.queryByTestId('sf-trace')).toBeNull();
    first.unmount();
    rpc.mockImplementation(async (method: string) => method === 'agentLab.get'
      ? { ok: true, data: { ...base, turns: [{ role: 'agent', text: 'A', planId: 'p1' }, { role: 'agent', text: 'B', planId: 'p2' }] } }
      : method === 'agentLab.trace' && rpc.mock.calls.filter(([m]) => m === 'agentLab.trace').length === 1 ? { ok: false, error: 'socket closed' } : Promise.reject(new Error('down')));
    mount();
    await waitFor(() => expect(screen.getByTestId('sf-trace').textContent).toContain('socket closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Turn 1' }));
    await waitFor(() => expect(screen.getByTestId('sf-trace').textContent).toContain('down'));
  });

  it('explains a run that could not be read and offers a fresh preview', async () => {
    const onClose = vi.fn();
    rpc.mockRejectedValueOnce(new Error('plugin restarted'));
    mount({ onClose });
    expect((await screen.findByRole('alert')).textContent).toContain('plugin restarted');
    fireEvent.click(screen.getByRole('button', { name: 'Start a new preview' }));
    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
    rpc.mockResolvedValueOnce(null);
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('no longer available');
  });
});

/** @vitest-environment happy-dom */
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_CHANGED_CHANNEL, type ExplorerNode, type ScenarioSuite } from '../../../lib/studio-contract.js';
import { BottomTests, BottomTrace } from './BottomPanes.js';
import { StudioShell } from './StudioShell.js';
import { suiteStatus, useSuiteList, useSuites, withSuiteBadges } from './useSuites.js';

const rpc = vi.fn();
let realtime: ((payload: unknown) => void) | undefined;
const suite = (over: Partial<ScenarioSuite> = {}): ScenarioSuite => ({ id: 's1', path: 'tests/a.scenario.json', cases: [{ id: 'c1', name: 'one', utterances: ['hi'], expect: {} }], ...over });
const res = (outcome: 'pass' | 'fail' | 'inconclusive') => ({ outcome, runId: 'r', at: 1 });

beforeEach(() => {
  rpc.mockReset(); realtime = undefined;
  (globalThis as any).__ZCC_HOST_REACT__ = React;
  (globalThis as any).__ZCC_PLUGIN_HOST__ = { callRpc: rpc };
  (globalThis as any).__ZCC_PLUGIN_RUNTIME__ = {
    useRealtime: (channel: string, handler: (p: unknown) => void) => { if (channel === STUDIO_CHANGED_CHANNEL) realtime = handler; }
  };
});
afterEach(() => { cleanup(); delete (globalThis as any).__ZCC_PLUGIN_RUNTIME__; delete (globalThis as any).__ZCC_PLUGIN_HOST__; });

describe('StudioShell', () => {
  const setup = (over: Record<string, unknown> = {}) => {
    const p = { onSave: vi.fn(), onQuickOpenChange: vi.fn(), onQuickPick: vi.fn() };
    const view = render(<StudioShell layout="wide" tier={960} top={<i data-testid="top" />} activity={<i data-testid="act" />} explorer={<i data-testid="exp" />}
      quickOpen={false} quickItems={[{ id: 'a', label: 'Help.agent', path: 'Help.agent' } as any]} {...p} {...over}><button data-testid="child">x</button></StudioShell>);
    return { ...p, ...view };
  };
  it('renders slots and layout attributes', () => {
    const { container } = setup();
    const root = container.querySelector('.sf-studio')!;
    expect(root.getAttribute('data-layout')).toBe('wide');
    expect(root.getAttribute('data-local-shortcuts')).toBe('s p');
    expect(root.getAttribute('data-tier')).toBe('960');
    for (const id of ['top', 'act', 'exp', 'child']) expect(screen.getByTestId(id)).toBeTruthy();
  });
  it('handles Cmd/Ctrl+S and Cmd/Ctrl+P but ignores other chords', () => {
    const { onSave, onQuickOpenChange } = setup({ tier: null });
    const child = screen.getByTestId('child');
    fireEvent.keyDown(child, { key: 's', metaKey: true });
    fireEvent.keyDown(child, { key: 'S', ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(child, { key: 'p', ctrlKey: true });
    expect(onQuickOpenChange).toHaveBeenCalledWith(true);
    fireEvent.keyDown(child, { key: 's' });
    fireEvent.keyDown(child, { key: 's', metaKey: true, shiftKey: true });
    fireEvent.keyDown(child, { key: 's', metaKey: true, altKey: true });
    fireEvent.keyDown(child, { key: 'x', metaKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onQuickOpenChange).toHaveBeenCalledTimes(1);
  });
  it('resizes the explorer by drag (one commit per drag), keyboard and double-click reset', () => {
    const onExplorerWidth = vi.fn();
    const { container, rerender } = setup({ explorerWidth: 300, onExplorerWidth });
    const col = container.querySelector<HTMLElement>('.sf-explorer-col')!;
    const handle = screen.getByRole('separator', { name: 'Resize explorer' });
    expect(col.style.width).toBe('300px');
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
    fireEvent.pointerDown(handle, { button: 2, clientX: 100 });
    expect(handle.className).not.toContain('is-dragging');
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    expect(handle.className).toContain('is-dragging');
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1 });
    expect(col.style.width).toBe('360px');
    fireEvent.pointerMove(handle, { clientX: 2000, pointerId: 1 });
    expect(col.style.width).toBe('480px');
    expect(onExplorerWidth).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientX: 2000, pointerId: 1 });
    expect(onExplorerWidth).toHaveBeenCalledWith(480);
    expect(handle.className).not.toContain('is-dragging');
    // A click without movement commits nothing.
    onExplorerWidth.mockClear();
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerCancel(handle);
    expect(onExplorerWidth).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onExplorerWidth).toHaveBeenLastCalledWith(284);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onExplorerWidth).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onExplorerWidth).toHaveBeenLastCalledWith(200);
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onExplorerWidth).toHaveBeenCalledTimes(4);
    fireEvent.doubleClick(handle);
    expect(onExplorerWidth).toHaveBeenLastCalledWith(null);
    // Default width, and no handle when the host cannot store a width.
    rerender(<StudioShell layout="wide" tier={960} explorer={<i />} explorerWidth={null} quickOpen={false} quickItems={[]} onQuickOpenChange={vi.fn()} onQuickPick={vi.fn()} onSave={vi.fn()}><i /></StudioShell>);
    expect(container.querySelector<HTMLElement>('.sf-explorer-col')!.style.width).toBe('260px');
    expect(screen.queryByRole('separator')).toBeNull();
  });
  it('toggles the explorer with Cmd/Ctrl+B only when the layout offers it', () => {
    const onToggleExplorer = vi.fn();
    const { rerender } = render(<StudioShell layout="wide" tier={960} quickOpen={false} quickItems={[]} onQuickOpenChange={vi.fn()} onQuickPick={vi.fn()} onSave={vi.fn()} onToggleExplorer={onToggleExplorer}><div data-testid="b-child" /></StudioShell>);
    expect(screen.getByTestId('b-child').closest('.sf-studio')!.getAttribute('data-local-shortcuts')).toBe('s p b');
    fireEvent.keyDown(screen.getByTestId('b-child'), { key: 'b', metaKey: true });
    expect(onToggleExplorer).toHaveBeenCalledTimes(1);
    rerender(<StudioShell layout="compact" tier={400} quickOpen={false} quickItems={[]} onQuickOpenChange={vi.fn()} onQuickPick={vi.fn()} onSave={vi.fn()}><div data-testid="b-child" /></StudioShell>);
    fireEvent.keyDown(screen.getByTestId('b-child'), { key: 'b', ctrlKey: true });
    expect(onToggleExplorer).toHaveBeenCalledTimes(1);
  });
  it('shows QuickOpen and closes it', () => {
    const { onQuickOpenChange } = setup({ quickOpen: true });
    expect(screen.getByText('Help.agent')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', {}) ?? document.body, { key: 'Escape' });
    expect(onQuickOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('useSuites helpers', () => {
  it('computes suite status', () => {
    expect(suiteStatus(suite())).toBeUndefined();
    expect(suiteStatus(suite({ lastResults: { a: res('pass'), b: res('pass') } }))).toBe('pass');
    expect(suiteStatus(suite({ lastResults: { a: res('pass'), b: res('fail') } }))).toBe('fail');
    expect(suiteStatus(suite({ lastResults: { a: res('inconclusive') } }))).toBeUndefined();
  });
  it('badges scenario nodes only', () => {
    const nodes: ExplorerNode[] = [{ kind: 'scenario', path: 'tests/a.scenario.json', apiName: 'a' }, { kind: 'scenario', path: 'tests/b.scenario.json', apiName: 'b' }, { kind: 'agent', path: 'x.agent', apiName: 'x' }];
    expect(withSuiteBadges(nodes, [])).toBe(nodes);
    const out = withSuiteBadges(nodes, [suite({ lastResults: { a: res('fail') } })]);
    expect(out[0].badge?.status).toBe('fail');
    expect(out[1].badge).toBeUndefined();
    expect(out[2]).toBe(nodes[2]);
  });
});

describe('useSuites', () => {
  it('recovers idle saved specs on visible polling/focus and filters suite file events by project and agent', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      rpc.mockResolvedValue({ ok: true, suites: [suite()] });
      const { result, rerender, unmount } = renderHook(({ visible }) => useSuiteList('salesforce', 'p1', { visible, agentPath: 'a.agent', suitePath: 'tests/a.scenario.json' }), { initialProps: { visible: true } });
      await act(async () => {});
      expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.suites.list', { projectId: 'p1', agentPath: 'a.agent' });
      rpc.mockResolvedValue({ ok: true, suites: [suite({ id: 'external edit' })] });
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(result.current.suites[0]?.id).toBe('external edit');
      const count = rpc.mock.calls.length;
      await act(async () => {
        realtime?.({ kind: 'files', projectId: 'other', path: 'tests/a.scenario.json' });
        realtime?.({ kind: 'files', projectId: 'p1', path: 'tests/b.scenario.json' });
        realtime?.({ kind: 'files', projectId: 'p1', path: 'a.agent' });
      });
      expect(rpc).toHaveBeenCalledTimes(count);
      await act(async () => { realtime?.({ kind: 'files', projectId: 'p1' }); });
      expect(rpc).toHaveBeenCalledTimes(count + 1);
      visibility.mockReturnValue('hidden');
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); window.dispatchEvent(new Event('focus')); });
      expect(rpc).toHaveBeenCalledTimes(count + 1);
      visibility.mockReturnValue('visible');
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(rpc).toHaveBeenCalledTimes(count + 2);
      await act(async () => { realtime?.({ kind: 'files', projectId: 'p1', path: 'tests/a.scenario.json' }); });
      expect(rpc).toHaveBeenCalledTimes(count + 3);
      rerender({ visible: false });
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); window.dispatchEvent(new Event('focus')); });
      expect(rpc).toHaveBeenCalledTimes(count + 3);
      unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(rpc).toHaveBeenCalledTimes(count + 3);
    } finally { visibility.mockRestore(); vi.useRealTimers(); }
  });

  it('never overlaps poll reads or adopts a response from an old agent in the same project', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: unknown) => void;
      rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      rpc.mockResolvedValue({ ok: true, suites: [suite({ id: 'b' })] });
      const { result, rerender } = renderHook(({ path }) => useSuiteList('salesforce', 'p1', { agentPath: path }), { initialProps: { path: 'a.agent' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); window.dispatchEvent(new Event('focus')); });
      expect(rpc).toHaveBeenCalledTimes(1);
      rerender({ path: 'b.agent' });
      await act(async () => {});
      expect(result.current.suites[0]?.id).toBe('b');
      await act(async () => { finish({ ok: true, suites: [suite({ id: 'a' })] }); });
      expect(result.current.suites[0]?.id).toBe('b');
      expect(rpc).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('follows a superseding progress refresh and resolves an old load when project is cleared', async () => {
    rpc.mockResolvedValue({ ok: true, suites: [suite()] });
    const { result, rerender } = renderHook(({ projectId }: { projectId: string | undefined }) => useSuiteList('salesforce', projectId), { initialProps: { projectId: 'p1' as string | undefined } });
    await waitFor(() => expect(result.current.suites).toHaveLength(1));
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.refresh(); });
    rpc.mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    await act(async () => { realtime?.({ kind: 'suite-progress', projectId: 'p1' }); });
    expect(finishNew).toBeUndefined(); // invalidations coalesce behind the existing read
    await act(async () => { finishOld({ ok: true, suites: [suite({ id: 'stale' })] }); });
    await act(async () => { finishNew({ ok: true, suites: [suite({ id: 'fresh' })] }); expect(await pending).toBe(true); });
    expect(result.current.suites[0]?.id).toBe('fresh');
    rpc.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    act(() => { pending = result.current.refresh(); });
    rerender({ projectId: undefined });
    await act(async () => { finishOld({ ok: true, suites: [suite()] }); expect(await pending).toBe(false); });
    expect(result.current.suites).toEqual([]);
  });
  it('explicitly refreshes the same mounted list and reports a failed reload', async () => {
    rpc.mockResolvedValue({ ok: true, suites: [suite({ lastResults: { c1: res('pass') } })] });
    const { result } = renderHook(() => useSuiteList('salesforce', 'p1'));
    await waitFor(() => expect(result.current.suites).toHaveLength(1));
    rpc.mockResolvedValue({ ok: true, suites: [suite({ lastResults: { c1: res('fail') } })] });
    await act(async () => { expect(await result.current.refresh()).toBe(true); });
    expect(result.current.suites[0]?.lastResults?.c1?.outcome).toBe('fail');
    rpc.mockResolvedValue({ ok: false });
    await act(async () => { expect(await result.current.refresh()).toBe(false); });
    expect(result.current.suites[0]?.lastResults?.c1?.outcome).toBe('fail');
  });
  it('refreshes progress and discards a response from the previous project', async () => {
    let finishOld!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    rpc.mockResolvedValue({ ok: true, suites: [suite({ id: 'new-project' })] });
    const { result, rerender } = renderHook(({ projectId }) => useSuites('salesforce', projectId), { initialProps: { projectId: 'old' } });
    rerender({ projectId: 'new' });
    await waitFor(() => expect(result.current[0]?.id).toBe('new-project'));
    await act(async () => finishOld({ ok: true, suites: [suite({ id: 'old-project' })] }));
    expect(result.current[0]?.id).toBe('new-project');
    rpc.mockResolvedValue({ ok: true, suites: [suite({ id: 'progress-update' })] });
    await act(async () => { realtime?.({ kind: 'suite-progress', projectId: 'new' }); });
    await waitFor(() => expect(result.current[0]?.id).toBe('progress-update'));
  });
  it('loads, refreshes on suites changes and tolerates failures', async () => {
    rpc.mockResolvedValue({ ok: true, suites: [suite()] });
    const { result } = renderHook(() => useSuites('salesforce', 'p1'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.suites.list', { projectId: 'p1' });
    rpc.mockResolvedValue({ ok: true, suites: [suite(), suite({ id: 's2' })] });
    await act(async () => { realtime?.({ kind: 'comments', projectId: 'p1' }); });
    await act(async () => { realtime?.({ kind: 'suites', projectId: 'other' }); });
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => { realtime?.({ kind: 'suites', projectId: 'p1' }); });
    await waitFor(() => expect(result.current).toHaveLength(2));
    rpc.mockRejectedValue(new Error('boom'));
    await act(async () => { realtime?.({ kind: 'suites' }); });
    expect(result.current).toHaveLength(2);
  });
  it('is empty without a project', async () => {
    const { result } = renderHook(() => useSuites('salesforce', undefined));
    expect(result.current).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('BottomTests', () => {
  it('shows an empty state and suite rows', () => {
    const onOpenTests = vi.fn();
    const { rerender } = render(<BottomTests suites={[]} onOpenTests={onOpenTests} />);
    expect(screen.getByText(/No scenario suites yet/)).toBeTruthy();
    fireEvent.click(screen.getByText('Open Tests'));
    expect(onOpenTests).toHaveBeenCalledTimes(1);
    rerender(<BottomTests onOpenTests={onOpenTests} suites={[
      suite({ lastResults: { c1: res('fail') } }),
      suite({ id: 's2', path: 'tests/b.scenario.json', cases: [], lastResults: { a: res('pass') } }),
      suite({ id: 's3', path: 'tests/c.scenario.json' })
    ]} />);
    expect(screen.getByText('0 passed · 1 failed')).toBeTruthy();
    expect(screen.getByText('0 passed · 1 not run')).toBeTruthy();
    const summaries = [...document.querySelectorAll('summary')];
    expect(summaries[0].textContent).toContain('a.scenario.json · 1 case');
    expect(summaries[1].textContent).toContain('b.scenario.json · 0 cases');
    fireEvent.click(screen.getByText('Open Tests'));
    expect(onOpenTests).toHaveBeenCalledTimes(2);
  });
});

describe('BottomTrace', () => {
  const base = { pluginId: 'salesforce', path: 'Help.agent', visible: true, onOpenPreview: vi.fn() };
  const snapshot = { id: 'target', path: 'Help.agent', engine: 'preview', turns: [{ role: 'agent', text: 'Welcome' }, { role: 'user', text: 'Hi' }, { role: 'agent', text: 'first', planId: 'plan-first' }, { role: 'agent', text: 'last', planId: 'plan-last' }] };
  it('loads the requested run/reply in project scope and focuses its exact step', async () => {
    rpc.mockImplementation(async (_plugin, method, args) => method === 'agentLab.get' ? { ok: true, data: snapshot } : {
      ok: true, data: { runId: args.id, planId: args.planId, turn: args.turn, available: true, steps: [{ kind: 'response', label: 'Requested reply', outputPreview: 'first' }] }
    });
    const { rerender } = render(<BottomTrace {...base} projectId="p1" run={{ runId: 'other-current-run', engine: 'live', turn: 9 }} focus={{ runId: 'target', turn: 2, step: 0, seq: 1 }} />);
    expect((await screen.findByText('Requested reply')).closest('[role=listitem]')?.getAttribute('aria-current')).toBe('step');
    expect(rpc).toHaveBeenCalledWith('salesforce', 'agentLab.get', { projectId: 'p1', id: 'target' });
    expect(rpc).toHaveBeenCalledWith('salesforce', 'agentLab.trace', { projectId: 'p1', id: 'target', engine: 'simulate', path: 'Help.agent', turn: 2, planId: 'plan-first' });
    await waitFor(() => expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(true));
    rerender(<BottomTrace {...base} projectId="p1" run={null} focus={{ runId: 'target', turn: 0, seq: 2 }} />);
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('salesforce', 'agentLab.trace', expect.objectContaining({ turn: 3, planId: 'plan-last' })));
    expect(rpc.mock.calls.every(([, , args]) => !args.includeSource)).toBe(true);
  });
  it('refuses an unrelated owner, missing reply/plan or missing run without tracing anything else', async () => {
    const { rerender } = render(<BottomTrace {...base} run={null} visible={false} focus={{ runId: 'target', turn: 1, seq: 0 }} />);
    expect(rpc).not.toHaveBeenCalled();
    const attempts = [
      { result: { ok: true, data: { ...snapshot, path: 'Other.agent' } }, turn: 2, message: 'does not belong' },
      { result: { ok: true, data: snapshot }, turn: 4, message: 'reply is unavailable' },
      { result: { ok: true, data: snapshot }, turn: 1, message: 'no plan to trace' },
      { result: { ok: true, data: { ...snapshot, id: 'wrong' } }, turn: 2, message: 'requested run is unavailable' },
      { result: { ok: false, error: 'gone' }, turn: 2, message: 'gone' },
      { result: null, turn: 2, message: 'no longer available' }
    ];
    for (const [seq, attempt] of attempts.entries()) {
      rpc.mockResolvedValueOnce(attempt.result);
      rerender(<BottomTrace {...base} run={null} focus={{ runId: 'target', turn: attempt.turn, seq: seq + 1 }} />);
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(attempt.message));
    }
    expect(rpc.mock.calls.every(([, method]) => method === 'agentLab.get')).toBe(true);
  });
  it('shows a targeted rehearsal approximation and discards old owner/scope lookups', async () => {
    let oldGet!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(resolve => { oldGet = resolve; }));
    const { rerender } = render(<BottomTrace {...base} projectId="old" run={null} focus={{ runId: 'target', turn: 2, seq: 1 }} />);
    rpc.mockResolvedValueOnce({ ok: true, data: { ...snapshot, path: 'New.agent', engine: 'rehearsal' } });
    rerender(<BottomTrace {...base} projectId="new" path="New.agent" run={null} focus={{ runId: 'target', turn: 2, seq: 2 }} />);
    await waitFor(() => expect(screen.getByTestId('sf-trace').textContent).toContain('Approximation'));
    await act(async () => oldGet({ ok: true, data: snapshot }));
    expect(rpc.mock.calls.every(([, method]) => method === 'agentLab.get')).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('discards an in-flight trace after changing targets and on unmount', async () => {
    let oldTrace!: (value: unknown) => void;
    rpc.mockImplementation(async (_plugin, method) => method === 'agentLab.get' ? { ok: true, data: snapshot } : new Promise(resolve => { oldTrace = resolve; }));
    const { rerender, unmount } = render(<BottomTrace {...base} run={null} focus={{ runId: 'target', turn: 2, seq: 1 }} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    rpc.mockResolvedValue({ ok: false, error: 'new run unavailable' });
    rerender(<BottomTrace {...base} run={null} focus={{ runId: 'new', turn: 1, seq: 2 }} />);
    expect(screen.queryByText('Old secret')).toBeNull();
    await screen.findByText('new run unavailable');
    await act(async () => oldTrace({ ok: true, data: { available: true, steps: [{ kind: 'response', label: 'Old secret' }] } }));
    expect(screen.queryByText('Old secret')).toBeNull();
    unmount();
  });
  it('preserves keyboard focus when typing begins while a requested trace is loading', async () => {
    let finishTrace!: (value: unknown) => void;
    rpc.mockImplementation(async (_plugin, method) => method === 'agentLab.get' ? { ok: true, data: snapshot } : new Promise(resolve => { finishTrace = resolve; }));
    render(<><input aria-label="Editor" /><BottomTrace {...base} run={null} focus={{ runId: 'target', turn: 2, step: 0, seq: 1 }} /></>);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    const editor = screen.getByRole('textbox', { name: 'Editor' });
    editor.focus();
    fireEvent.change(editor, { target: { value: 'Still typing' } });
    fireEvent.keyDown(editor, { key: 'g' });
    await act(async () => finishTrace({ ok: true, data: { runId: 'target', planId: 'plan-first', turn: 2, available: true,
      steps: [{ kind: 'response', label: 'Requested step', outputPreview: 'reply' }] } }));
    await waitFor(() => expect(screen.getByText('Requested step').closest('[role=listitem]')?.getAttribute('aria-current')).toBe('step'));
    expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect((editor as HTMLInputElement).value).toBe('Still typing');
  });
  it('prompts when there is no run and opens Preview', () => {
    render(<BottomTrace {...base} run={null} />);
    expect(screen.getByText(/Run a conversation in Preview/)).toBeTruthy();
    fireEvent.click(screen.getByText('Open Preview'));
    expect(base.onOpenPreview).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('shows the rehearse approximation without fetching', () => {
    render(<BottomTrace {...base} run={{ runId: 'r1', engine: 'rehearse', turn: 1 }} />);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('fetches the trace for a live run, and does not fetch when hidden', async () => {
    rpc.mockResolvedValue({ ok: true, data: { runId: 'r1', turn: 1, available: true, steps: [] } });
    const { rerender } = render(<BottomTrace {...base} visible={false} run={{ runId: 'r1', engine: 'live', turn: 1 }} />);
    expect(rpc).not.toHaveBeenCalled();
    rerender(<BottomTrace {...base} run={{ runId: 'r1', engine: 'live', turn: 1 }} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('salesforce', 'agentLab.trace', { id: 'r1', engine: 'live', path: 'Help.agent' }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('reports unavailable and rejected traces', async () => {
    rpc.mockResolvedValueOnce({ ok: false, error: 'No planner trace.' });
    const { rerender } = render(<BottomTrace {...base} path={null} run={{ runId: 'r1', engine: 'simulate', turn: 1 }} />);
    expect((await screen.findByRole('alert')).textContent).toBe('No planner trace.');
    rpc.mockRejectedValueOnce(new Error('network'));
    rerender(<BottomTrace {...base} path={null} run={{ runId: 'r2', engine: 'simulate', turn: 1 }} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('network'));
    rpc.mockResolvedValueOnce(null);
    rerender(<BottomTrace {...base} path={null} run={{ runId: 'r3', engine: 'simulate', turn: 1 }} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The trace is unavailable.'));
  });
});

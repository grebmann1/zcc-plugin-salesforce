/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentAction } from '../../lib/agent-action-model.js';
import type { LightningTypeSummary } from '../../lib/studio-contract.js';
const rpc = vi.hoisted(() => vi.fn());
const realtime = vi.hoisted(() => ({ handler: (_payload: unknown) => {} }));
vi.mock('@zana-ai/zcc-plugin-sdk/app', () => ({ callPluginRpc: rpc, useRealtime: (_channel: string, handler: (payload: unknown) => void) => { realtime.handler = handler; } }));
vi.mock('./studio/LightningTypeView.js', () => ({ LightningTypeView: (p: { typeRef: string; onOpenComponent(ref: string): void }) => <div data-testid="type-detail">{p.typeRef}<button onClick={() => p.onOpenComponent('c/orderCard')}>Open renderer</button></div> }));
vi.mock('./studio/LwcBundleView.js', () => ({ LwcBundleView: (p: { componentRef: string; via: string[]; onOpenType(ref: string): void }) => <div data-testid="component-detail">{p.componentRef}<button onClick={() => p.onOpenType(p.via[0])}>Open type</button></div> }));
import { AgentTypesView } from './AgentTypesView.js';

const component = { ref: 'c/orderCard', namespace: 'c', name: 'orderCard', role: 'renderer' as const, channel: 'lightningDesktopGenAi', target: '$', path: 'lwc/orderCard' };
const types: LightningTypeSummary[] = [
  { ref: 'c__Order', title: 'Order request', standard: false, status: 'ready', components: [component, { ...component, role: 'editor' }] },
  { ref: 'c__Ghost', standard: false, status: 'missing', components: [{ ...component, ref: 'ns/ghost', path: undefined }] },
  { ref: 'lightning__textType', standard: true, status: 'standard', components: [] }
];
const actions: AgentAction[] = [{ id: 'topic.orders/lookup', name: 'Lookup', owner: 'topic.orders', target: 'apex://Lookup', description: '', line: 1, inputs: [{ name: 'order', type: 'object', required: true, description: '', lightningType: 'c__Order' }], outputs: types.map(t => ({ name: t.ref, type: 'object', required: false, description: '', lightningType: t.ref })), uses: [] }];
const props = { pluginId: 'sf', projectId: 'p', actions, loading: false, error: null, request: null, onOpenAction: vi.fn(), onReturnToAction: vi.fn() };
beforeEach(() => { rpc.mockReset().mockResolvedValue({ ok: true, types, truncated: false }); props.onOpenAction.mockClear(); props.onReturnToAction.mockClear(); });
afterEach(cleanup);

describe('AgentTypesView', () => {
  it('refreshes the mounted reference catalogue for this project without losing search state', async () => {
    render(<AgentTypesView {...props} />);
    await screen.findByRole('button', { name: /Order request c__Order/ });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search types and components' }), { target: { value: 'Order' } });
    await act(async () => realtime.handler({ kind: 'files', projectId: 'other' }));
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce({ ok: true, types: [{ ...types[0], title: 'Order changed' }], truncated: false });
    await act(async () => realtime.handler({ kind: 'files', projectId: 'p' }));
    expect(screen.getByRole('button', { name: /Order changed c__Order/ })).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Order');
  });
  it('catalogues only AST-declared types, groups standard/custom and deduplicates renderer/editor components', async () => {
    render(<AgentTypesView {...props} />);
    expect(screen.getByRole('status').textContent).toBe('Loading types…');
    await screen.findByRole('button', { name: /Order request c__Order/ });
    expect(rpc).toHaveBeenCalledWith('sf', 'studio.agentTypes', { projectId: 'p', refs: ['c__Order', 'c__Ghost', 'lightning__textType'] });
    expect(screen.getByRole('heading', { name: 'Custom types 2' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Standard types 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /c__Ghost/ }).textContent).toContain('Not in project');
    fireEvent.click(screen.getByRole('button', { name: 'Components 2' }));
    expect(screen.getByRole('button', { name: /orderCard c\/orderCard/ }).textContent).toContain('1 type');
    expect(screen.getByRole('button', { name: /ghost ns\/ghost/ }).textContent).toContain('Not in project');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } });
    expect(screen.getByText('No matching components.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lightning Types 3' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'orderCard' } });
    expect(screen.getByRole('button', { name: /Order request c__Order/ })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } });
    expect(screen.getByText('No matching types.')).toBeTruthy();
  });
  it('opens type → component → related type, with Back and action usage links', async () => {
    render(<AgentTypesView {...props} />);
    const row = await screen.findByRole('button', { name: /Order request c__Order/ });
    screen.getByTestId('atp-types').scrollTop = 160;
    fireEvent.click(row);
    expect(screen.getByTestId('type-detail').textContent).toContain('c__Order');
    fireEvent.click(screen.getByRole('button', { name: 'Lookup ↗' }));
    expect(props.onOpenAction).toHaveBeenCalledWith(actions[0].id);
    fireEvent.click(screen.getByRole('button', { name: 'Open renderer' }));
    expect(screen.getByTestId('component-detail').textContent).toContain('c/orderCard');
    fireEvent.click(screen.getByRole('button', { name: 'Open type' }));
    fireEvent.click(screen.getByRole('button', { name: '← Back', exact: true }));
    expect(screen.getByTestId('component-detail')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Back', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '← All Lightning Types' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Order request c__Order/ }));
    expect(screen.getByTestId('atp-types').scrollTop).toBe(160);
    fireEvent.click(screen.getByRole('button', { name: 'Components 2' }));
    fireEvent.click(screen.getByRole('button', { name: /orderCard c\/orderCard/ }));
    fireEvent.click(screen.getByRole('button', { name: '← All components' }));
    expect(screen.getByRole('button', { name: /orderCard c\/orderCard/ })).toBeTruthy();
  });
  it('bounds large draft requests while preserving direct links to types beyond the catalogue', async () => {
    const refs = Array.from({ length: 125 }, (_, i) => `c__Type${i}`);
    const many = [{ ...actions[0], inputs: [], outputs: refs.map(ref => ({ name: ref, type: 'object', required: false, description: '', lightningType: ref })) }];
    const ui = render(<AgentTypesView {...props} actions={many} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('sf', 'studio.agentTypes', { projectId: 'p', refs: refs.slice(0, 120) }));
    ui.rerender(<AgentTypesView {...props} actions={many} request={{ ref: refs[124], seq: 1, fromAction: true }} />);
    expect(screen.getByTestId('type-detail').textContent).toContain(refs[124]);
  });
  it('returns to the action that opened a type, and Browse all leaves that trail', async () => {
    const { rerender } = render(<AgentTypesView {...props} request={{ ref: 'c__Order', seq: 1, fromAction: true }} />);
    await screen.findByTestId('type-detail');
    fireEvent.click(screen.getByRole('button', { name: '← Back to action' }));
    expect(props.onReturnToAction).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Browse all' }));
    fireEvent.click(screen.getByRole('button', { name: /Order request c__Order/ }));
    expect(screen.getByRole('button', { name: '← All Lightning Types' })).toBeTruthy();
    rerender(<AgentTypesView {...props} request={{ ref: 'lightning__textType', seq: 2, fromAction: true }} />);
    expect(screen.getByTestId('type-detail').textContent).toContain('lightning__textType');
    rerender(<AgentTypesView {...props} actions={[]} request={{ ref: 'c__Order', seq: 3, fromAction: false }} />);
    expect(screen.getByText('This reference is no longer used by the current draft.')).toBeTruthy();
  });
  it('refreshes metadata, reports bounds, and keeps full action type links available beyond the catalogue cap', async () => {
    rpc.mockResolvedValue({ ok: true, types: [], truncated: true });
    const ui = render(<AgentTypesView {...props} />);
    await screen.findByText(/Showing the first 60 types/);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    ui.rerender(<AgentTypesView {...props} request={{ ref: 'c__Order', seq: 1, fromAction: true }} />);
    expect(screen.getByTestId('type-detail').textContent).toContain('c__Order');
    fireEvent.click(screen.getByRole('button', { name: 'Open renderer' }));
    expect(screen.getByTestId('component-detail')).toBeTruthy();
  });
  it('explains empty drafts, unlinked components and missing project context without unnecessary reads', async () => {
    const ui = render(<AgentTypesView {...props} actions={[]} />);
    expect(screen.getByText('No Lightning Types are declared by this agent’s actions.')).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    ui.rerender(<AgentTypesView {...props} projectId={undefined} />);
    expect(screen.getByText(/Open this agent in a project/)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ ok: true, types: [{ ...types[0], components: [] }] });
    ui.rerender(<AgentTypesView {...props} />);
    await screen.findByRole('button', { name: /Order request c__Order/ });
    fireEvent.click(screen.getByRole('button', { name: 'Components 0' }));
    expect(screen.getByText(/No renderer or editor components/)).toBeTruthy();
  });
  it('shows parse/read failures, can retry, and ignores late answers after project or draft changes', async () => {
    const ui = render(<AgentTypesView {...props} loading error="Parse failed" />);
    expect(screen.getByRole('status')).toBeTruthy();
    ui.rerender(<AgentTypesView {...props} error="Parse failed" />);
    expect(screen.getByRole('alert').textContent).toBe('Parse failed');
    rpc.mockResolvedValueOnce({ ok: false, error: 'Read failed' });
    ui.rerender(<AgentTypesView {...props} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Read failed');
    rpc.mockRejectedValueOnce('offline');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('offline'));
    rpc.mockRejectedValueOnce(new Error('lost connection'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('lost connection'));
    rpc.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The Lightning Types could not be read.'));
    let finish!: (v: unknown) => void;
    rpc.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    ui.rerender(<AgentTypesView {...props} projectId="p2" />);
    await screen.findByRole('button', { name: /Order request c__Order/ });
    await act(async () => { finish({ ok: false, error: 'Stale reply' }); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

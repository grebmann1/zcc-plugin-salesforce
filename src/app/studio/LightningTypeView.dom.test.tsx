/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const realtime = vi.hoisted(() => ({ handler: (_payload: unknown) => {} }));
vi.mock('@zana-ai/zcc-plugin-sdk/app', () => ({ callPluginRpc: rpc, useRealtime: (_channel: string, handler: (payload: unknown) => void) => { realtime.handler = handler; } }));
const { LightningTypeView } = await import('./LightningTypeView.js');
const { clearReadCache } = await import('./read-cache.js');

afterEach(() => { cleanup(); rpc.mockReset(); clearReadCache(); });

const READY = {
  ref: 'c__OrderRequest', standard: false, status: 'ready', path: 'force-app/main/default/lightningTypes/OrderRequest', title: 'Order request', description: 'What the agent sends.',
  properties: [{ name: 'orderId', type: 'lightning__textType', title: 'Order', description: 'Order number', required: true }, { name: 'notes', required: false }],
  files: [
    { path: 'force-app/main/default/lightningTypes/OrderRequest/schema.json', content: '{"title":"Order request"}' },
    { path: 'force-app/main/default/lightningTypes/OrderRequest/lightningDesktopGenAi/renderer.json', content: '', truncated: true }
  ]
};

describe('LightningTypeView', () => {
  it('keeps the selected source path after additions and reordering, with a stable fallback after deletion', async () => {
    rpc.mockResolvedValue({ ok: true, data: READY });
    const ui = render(<LightningTypeView pluginId="sf" projectId="p1" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'lightningDesktopGenAi/renderer.json' }));
    const added = { path: `${READY.path}/lightningDesktopGenAi/editor.json`, content: '{"editor":true}' };
    const refreshFiles = async (files: typeof READY.files) => {
      rpc.mockResolvedValueOnce({ ok: true, data: { ...READY, files } });
      await act(async () => realtime.handler({ kind: 'files', projectId: 'p1', path: READY.path }));
    };
    await refreshFiles([added, READY.files[1], READY.files[0]]);
    expect(screen.getByLabelText(`Source of ${READY.files[1].path}`).textContent).toContain('larger than 256 KB');
    expect(screen.getByRole('button', { name: 'lightningDesktopGenAi/renderer.json' }).getAttribute('aria-pressed')).toBe('true');
    await refreshFiles([added, READY.files[0]]);
    expect(screen.getByLabelText(`Source of ${added.path}`).textContent).toBe(added.content);
    await refreshFiles([READY.files[1], added, READY.files[0]]);
    expect(screen.getByLabelText(`Source of ${added.path}`)).toBeTruthy();
    // A different project owns a new selection, even when its bundle paths match.
    rpc.mockResolvedValueOnce({ ok: true, data: READY });
    ui.rerender(<LightningTypeView pluginId="sf" projectId="p2" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(`Source of ${READY.files[0].path}`)).toBeTruthy());
  });
  it('updates mounted schema and contract from scoped files events or manual Refresh', async () => {
    rpc.mockResolvedValue({ ok: true, data: READY });
    render(<LightningTypeView pluginId="sf" projectId="p1" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Order request' });
    await act(async () => realtime.handler({ kind: 'files', projectId: 'other' }));
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce({ ok: true, data: { ...READY, title: 'Updated request', properties: [{ name: 'newField', type: 'String', required: false }] } });
    await act(async () => realtime.handler({ kind: 'files', projectId: 'p1', path: `${READY.path}/schema.json` }));
    expect(screen.getByRole('heading', { name: 'Updated request' })).toBeTruthy();
    expect(screen.getByText('newField')).toBeTruthy();
    rpc.mockRejectedValueOnce(Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Lightning Type' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Offline');
    expect(screen.getByText('newField')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Lightning Type' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  it('explains an Apex-backed schema instead of implying that the type has no fields', async () => {
    rpc.mockResolvedValue({ ok: true, data: { ...READY, baseType: '@apexClassType/c__Order$Request', properties: [] } });
    render(<LightningTypeView pluginId="sf" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    expect(await screen.findByText('@apexClassType/c__Order$Request')).toBeTruthy();
    expect(screen.getByText('Fields are defined by the Apex class.')).toBeTruthy();
  });
  it('shows its last answer at once when it remounts', async () => {
    rpc.mockResolvedValue({ ok: true, data: READY });
    const first = render(<LightningTypeView pluginId="sf" projectId="p1" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Order request' })).toBeTruthy();
    first.unmount();
    render(<LightningTypeView pluginId="sf" projectId="p1" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Order request' })).toBeTruthy();
    // Another project has its own answers.
    render(<LightningTypeView pluginId="sf" projectId="p2" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
  it('shows properties, used-by links and bundle files', async () => {
    rpc.mockResolvedValue({ ok: true, data: READY });
    const onOpenAgent = vi.fn();
    render(<LightningTypeView pluginId="sf" projectId="p1" typeRef="c__OrderRequest" usedBy={['force-app/bots/Orders.agent']} onOpenAgent={onOpenAgent} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Order request' })).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('sf', 'studio.lightningType', { projectId: 'p1', ref: 'c__OrderRequest' });
    expect(screen.getByText('Custom')).toBeTruthy();
    expect(screen.getByText('What the agent sends.')).toBeTruthy();
    expect(screen.getByTitle('Required')).toBeTruthy();
    expect(screen.getByText('Order number')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(onOpenAgent).toHaveBeenCalledWith('force-app/bots/Orders.agent');
    expect(screen.getByLabelText(/Source of .*schema\.json/).textContent).toBe('{"title":"Order request"}');
    fireEvent.click(screen.getByRole('button', { name: 'lightningDesktopGenAi/renderer.json' }));
    expect(screen.getByLabelText(/Source of .*renderer\.json/).textContent).toMatch(/larger than 256 KB/);
  });
  it('lists the components the type renders and edits with, openable when the host allows it', async () => {
    const components = [
      { ref: 'c/orderCard', namespace: 'c', name: 'orderCard', role: 'renderer', channel: 'lightningDesktopGenAi', target: '$', path: 'force-app/main/default/lwc/orderCard' },
      { ref: 'acme/noteChip', namespace: 'acme', name: 'noteChip', role: 'editor', channel: '', target: 'notes' }
    ];
    rpc.mockResolvedValue({ ok: true, data: { ...READY, components } });
    const onOpenComponent = vi.fn();
    const { rerender } = render(<LightningTypeView pluginId="sf" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} onOpenComponent={onOpenComponent} />);
    const table = await screen.findByRole('table', { name: 'Components' });
    expect(table.textContent).toContain('Whole type');
    expect(table.textContent).toContain('Renderer');
    expect(table.textContent).toContain('Editor');
    expect(table.textContent).toContain('Not in this project');
    expect(table.querySelector('tbody tr:nth-child(2) td:nth-child(3)')!.textContent).toBe('—');
    fireEvent.click(screen.getByRole('button', { name: 'acme/noteChip' }));
    expect(onOpenComponent).toHaveBeenCalledWith('acme/noteChip');
    rerender(<LightningTypeView pluginId="sf" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'c/orderCard' })).toBeNull();
    expect(screen.getByText('c/orderCard').tagName).toBe('CODE');
  });
  it('explains standard and missing types without a properties table', async () => {
    rpc.mockResolvedValueOnce({ ok: true, data: { ref: 'lightning__textType', standard: true, status: 'standard', properties: [], files: [], message: 'A standard Lightning Type.' } });
    const { rerender } = render(<LightningTypeView pluginId="sf" typeRef="lightning__textType" onOpenAgent={vi.fn()} />);
    expect(await screen.findByText('Standard')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('sf', 'studio.lightningType', { ref: 'lightning__textType' });
    expect(screen.getByText('A standard Lightning Type.')).toBeTruthy();
    expect(screen.queryByText('Properties')).toBeNull();
    rpc.mockResolvedValueOnce({ ok: true, data: { ref: 'c__Ghost', standard: false, status: 'missing', properties: [], files: [], message: 'No bundle.' } });
    rerender(<LightningTypeView pluginId="sf" typeRef="c__Ghost" onOpenAgent={vi.fn()} />);
    expect(await screen.findByText('Not in project')).toBeTruthy();
  });
  it('shows an empty schema and read errors', async () => {
    rpc.mockResolvedValueOnce({ ok: true, data: { ...READY, properties: [], files: [], message: 'schema.json is not valid JSON.' } });
    const { rerender } = render(<LightningTypeView pluginId="sf" typeRef="c__A" onOpenAgent={vi.fn()} />);
    expect(await screen.findByText('No properties')).toBeTruthy();
    expect(screen.getByText('schema.json is not valid JSON.').className).toContain('is-warn');
    rpc.mockResolvedValueOnce({ ok: false, error: 'nope' });
    rerender(<LightningTypeView pluginId="sf" typeRef="c__B" onOpenAgent={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toBe('nope');
    rpc.mockResolvedValueOnce(null);
    rerender(<LightningTypeView pluginId="sf" typeRef="c__C" onOpenAgent={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The Lightning Type could not be read.'));
    rpc.mockRejectedValueOnce(new Error('offline'));
    rerender(<LightningTypeView pluginId="sf" typeRef="c__D" onOpenAgent={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('offline'));
    rpc.mockRejectedValueOnce('raw');
    rerender(<LightningTypeView pluginId="sf" typeRef="c__E" onOpenAgent={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('raw'));
  });
  it('ignores a late answer after the type changes', async () => {
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    rpc.mockResolvedValueOnce({ ok: true, data: READY });
    const { rerender } = render(<LightningTypeView pluginId="sf" typeRef="c__Old" onOpenAgent={vi.fn()} />);
    rerender(<LightningTypeView pluginId="sf" typeRef="c__OrderRequest" onOpenAgent={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Order request' })).toBeTruthy();
    resolve({ ok: false, error: 'stale' });
    await Promise.resolve();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

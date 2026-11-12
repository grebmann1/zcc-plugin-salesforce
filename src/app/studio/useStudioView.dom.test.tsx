/** @vitest-environment happy-dom */
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioViewStore, VIEW_TTL_MS } from '../../../lib/studio-view.js';
import { SHARE_STORAGE_KEY, useStudioView, VIEW_KEEPALIVE_MS, VIEW_PUBLISH_DEBOUNCE_MS } from './useStudioView.js';

const rpc = vi.fn();
const input = { surface: 'studio' as const, path: 'GuiAgentReview.agent', dirty: false, tool: 'code' as const, diagnostics: [], cursor: { line: 2, column: 1 } };
const props = { pluginId: 'salesforce', projectId: 'sandbox', threadId: 'review', input };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const sharedCalls = () => rpc.mock.calls.filter(call => call[2].state.share);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  localStorage.clear();
  rpc.mockReset().mockResolvedValue({ ok: true });
  (globalThis as any).__ZCC_HOST_REACT__ = React;
  (globalThis as any).__ZCC_PLUGIN_HOST__ = { callRpc: rpc };
});
afterEach(async () => {
  await act(async () => { cleanup(); });
  vi.useRealTimers();
  delete (globalThis as any).__ZCC_PLUGIN_HOST__;
});

describe('Studio view lifecycle', () => {
  it('keeps an idle view readable beyond the server TTL and removes it on close', async () => {
    const store = new StudioViewStore(Date.now);
    rpc.mockImplementation(async (_plugin, _method, args) => ({ ok: true, shared: store.publish(args.projectId, args.state, args.threadId, args.publisher) }));
    const hook = renderHook(() => useStudioView(props));
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    const firstAt = store.get('sandbox', 'review')!.state.at;
    await advance(VIEW_TTL_MS * 2 + 1);
    expect(store.get('sandbox', 'review')?.state).toMatchObject({ path: input.path, share: true, cursor: input.cursor });
    expect(store.get('sandbox', 'review')!.state.at).toBeGreaterThan(firstAt);
    expect(sharedCalls().length).toBeGreaterThan(3);
    await act(async () => { hook.unmount(); });
    expect(store.get('sandbox', 'review')).toBeNull();
    const count = rpc.mock.calls.length;
    await advance(VIEW_TTL_MS * 2);
    expect(rpc).toHaveBeenCalledTimes(count);
  });

  it('renews on schedule during continuous editor changes and uses the latest bounded view', async () => {
    const hook = renderHook(({ input }) => useStudioView({ ...props, input }), { initialProps: { input: { ...input, selection: { startLine: 1, endLine: 1, text: 'initial' } } } });
    // Editing faster than the debounce must not postpone the keepalive forever.
    for (let line = 1; line <= VIEW_KEEPALIVE_MS / 100; line++) {
      hook.rerender({ input: { ...input, cursor: { line, column: 1 }, selection: { startLine: line, endLine: line, text: 'x'.repeat(3000) } } });
      await advance(100);
    }
    expect(sharedCalls()).toHaveLength(1);
    expect(sharedCalls()[0][2].state).toMatchObject({ cursor: { line: 200, column: 1 } });
    expect(sharedCalls()[0][2].state.selection.text).toHaveLength(2000);
    hook.rerender({ input: { ...input, selection: { startLine: 1, endLine: 1, text: 'changed' } } });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(sharedCalls().at(-1)![2].state.selection.text).toBe('changed');
  });

  it('withdraws immediately when sharing turns off, cancels pending edits and sends no selected text', async () => {
    const hook = renderHook(({ input }) => useStudioView({ ...props, input }), { initialProps: { input: { ...input, selection: { startLine: 1, endLine: 1, text: 'private selection' } } } });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    hook.rerender({ input: { ...input, selection: { startLine: 1, endLine: 1, text: 'do not publish this' } } });
    await act(async () => { hook.result.current.setShare(false); });
    expect(rpc.mock.calls.at(-1)![2].state).toEqual({ surface: 'studio', path: input.path, dirty: false, tool: null, diagnostics: [], share: false, at: Date.now() });
    expect(localStorage.getItem(SHARE_STORAGE_KEY)).toBe('false');
    await advance(VIEW_TTL_MS * 2);
    expect(sharedCalls()).toHaveLength(1);
    await act(async () => { hook.result.current.setShare(true); });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(sharedCalls()).toHaveLength(2);
    expect(sharedCalls().at(-1)![2].state.selection.text).toBe('do not publish this');
  });

  it('withdraws despite a stuck publish and rejects that old snapshot when it arrives late', async () => {
    const store = new StudioViewStore(Date.now);
    let finish!: () => void;
    rpc.mockImplementation(async (_plugin, _method, args) => ({ ok: true, shared: store.publish(args.projectId, args.state, args.threadId, args.publisher) }));
    rpc.mockImplementationOnce((_plugin, _method, args) => new Promise<void>(resolve => { finish = () => { store.publish(args.projectId, args.state, args.threadId, args.publisher); resolve(); }; }));
    const hook = renderHook(() => useStudioView(props));
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    await act(async () => { hook.result.current.setShare(false); });
    expect(rpc.mock.calls.length).toBeGreaterThan(1);
    expect(rpc.mock.calls.at(-1)![2].state.share).toBe(false);
    expect(store.get('sandbox', 'review')).toBeNull();
    expect(rpc.mock.calls.at(-1)![2].publisher.sequence).toBeGreaterThan(sharedCalls()[0][2].publisher.sequence);
    await act(async () => { finish(); });
    expect(rpc.mock.calls.slice(1).every(call => !call[2].state.share)).toBe(true);
    expect(store.get('sandbox', 'review')).toBeNull();
    await advance(VIEW_TTL_MS * 2);
    expect(sharedCalls()).toHaveLength(1);
  });

  it('does not let a stalled host block keepalive recovery or a different project', async () => {
    let finish!: () => void;
    rpc.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const hook = renderHook(options => useStudioView(options), { initialProps: props });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    await advance(VIEW_KEEPALIVE_MS * 2);
    expect(sharedCalls()).toHaveLength(2);
    hook.rerender({ ...props, projectId: 'other' });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(rpc.mock.calls.at(-1)![2]).toMatchObject({ projectId: 'other', state: { share: true } });
    const sequences = rpc.mock.calls.map(call => call[2].publisher.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(rpc.mock.calls.map(call => call[2].publisher.id)).size).toBe(1);
    const count = rpc.mock.calls.length;
    await act(async () => { finish(); });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(rpc).toHaveBeenCalledTimes(count);
  });

  it('gives simultaneous windows independent ownership of the same shared script', async () => {
    const store = new StudioViewStore(Date.now);
    rpc.mockImplementation(async (_plugin, _method, args) => ({ ok: true, shared: store.publish(args.projectId, args.state, args.threadId, args.publisher) }));
    const first = renderHook(() => useStudioView(props));
    const second = renderHook(() => useStudioView(props));
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(new Set(sharedCalls().map(call => call[2].publisher.id)).size).toBe(2);
    await act(async () => { second.unmount(); });
    expect(store.get('sandbox', 'review')?.state.path).toBe(input.path);
    await act(async () => { first.unmount(); });
    expect(store.get('sandbox', 'review')).toBeNull();
  });

  it('publishes edits that arrived while the previous request was in flight', async () => {
    let finish!: () => void;
    rpc.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const hook = renderHook(({ input }) => useStudioView({ ...props, input }), { initialProps: { input } });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    hook.rerender({ input: { ...input, cursor: { line: 9, column: 3 } } });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(sharedCalls()).toHaveLength(1);
    await act(async () => { finish(); });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(sharedCalls()).toHaveLength(2);
    expect(sharedCalls()[1][2].state.cursor).toEqual({ line: 9, column: 3 });
  });

  it('withdraws old project/thread/path scopes and cancels their timers before sharing the new scope', async () => {
    const hook = renderHook(options => useStudioView(options), { initialProps: { ...props, projectId: 'first', threadId: 'one' } });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    hook.rerender({ ...props, projectId: 'second', threadId: 'two', input: { ...input, path: 'Other.agent' } });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(rpc.mock.calls[1][2]).toMatchObject({ projectId: 'first', threadId: 'one', state: { path: input.path, share: false } });
    expect(rpc.mock.calls[2][2]).toMatchObject({ projectId: 'second', threadId: 'two', state: { path: 'Other.agent', share: true } });
    await advance(VIEW_KEEPALIVE_MS);
    expect(rpc.mock.calls.slice(2).every(call => call[2].projectId === 'second' && call[2].threadId === 'two' && call[2].state.path === 'Other.agent')).toBe(true);
  });

  it.each(['reject', 'throw'] as const)('recovers from a host %s on the next keepalive', async failure => {
    rpc.mockImplementationOnce(() => { if (failure === 'throw') throw Error('host unavailable'); return Promise.reject(Error('offline')); });
    renderHook(() => useStudioView(props));
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(sharedCalls()).toHaveLength(1);
    await advance(VIEW_KEEPALIVE_MS);
    expect(sharedCalls()).toHaveLength(2);
    expect(sharedCalls()[1][2].state.at).toBe(Date.now() - VIEW_PUBLISH_DEBOUNCE_MS);
  });

  it('does not publish or install keepalive timers without a project, then publishes when one is selected', async () => {
    const hook = renderHook(({ projectId }) => useStudioView({ ...props, projectId, threadId: null }), { initialProps: { projectId: null as string | null } });
    await advance(VIEW_TTL_MS * 2);
    expect(rpc).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    hook.rerender({ projectId: 'selected' });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(rpc.mock.calls[0][2]).toEqual({ projectId: 'selected', state: expect.objectContaining({ share: true }), publisher: { id: expect.any(String), sequence: expect.any(Number) } });
    hook.rerender({ projectId: null });
    await advance(0);
    expect(rpc.mock.calls.at(-1)![2]).toMatchObject({ projectId: 'selected', state: { share: false } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('respects a saved sharing-off preference and private-storage failures', async () => {
    localStorage.setItem(SHARE_STORAGE_KEY, 'false');
    const disabled = renderHook(() => useStudioView(props));
    await advance(VIEW_TTL_MS * 2);
    expect(disabled.result.current.share).toBe(false);
    expect(sharedCalls()).toHaveLength(0);
    disabled.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('private storage'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('private storage'); });
    const fallback = renderHook(() => useStudioView({ ...props, defaultShare: false }));
    await act(async () => { fallback.result.current.setShare(true); });
    await advance(VIEW_PUBLISH_DEBOUNCE_MS);
    expect(fallback.result.current.share).toBe(true);
    expect(sharedCalls()).toHaveLength(1);
    vi.restoreAllMocks();
  });
});

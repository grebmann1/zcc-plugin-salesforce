import { describe, expect, it, vi } from 'vitest';
import type { StudioViewState } from '../lib/studio-contract.js';
import { STUDIO_RPC } from '../lib/studio-contract.js';
import { buildViewInstructions, describeView, INSTRUCTIONS_MAX_CHARS, readOpenComments, registerStudioContext, StudioViewStore, VIEW_MAX_ENTRIES, VIEW_MAX_PUBLISHERS, VIEW_PUBLISHER_TTL_MS, VIEW_TTL_MS, viewStoreFor } from '../lib/studio-view.js';

const state = (over: Partial<StudioViewState> = {}): StudioViewState => ({ surface: 'studio', path: 'force-app/Help.agent', dirty: false, tool: 'code', diagnostics: [], share: true, at: 1, ...over });

function harness(projectId = 'p1') {
  const handlers = new Map<string, (args: unknown) => unknown>();
  const providers: any[] = []; const mentions = new Map<string, any>(); const kv = new Map<string, unknown>();
  const zcc: any = {
    agents: { contributeInstructions: vi.fn((p: unknown) => providers.push(p)) },
    ui: { registerMentionProvider: (m: any) => mentions.set(m.id, m) },
    storage: { kv: { get: async (k: string) => kv.get(k) } },
    log: { warn: vi.fn() }
  };
  const studio: any = { zcc, registerRpc: (n: string, h: any) => handlers.set(n, h), contexts: { current: () => (projectId ? { projectId } : undefined) } };
  registerStudioContext(studio);
  return { handlers, providers, mentions, kv, zcc, studio, call: (n: string, a: unknown) => handlers.get(n)!(a) as any };
}

describe('StudioViewStore', () => {
  it('stores only shared views, expires after the TTL and prefers the thread view', () => {
    let t = 1000; const store = new StudioViewStore(() => t);
    expect(store.publish('p', state({ share: false }))).toBe(false);
    expect(store.get('p')).toBeNull();
    store.publish('p', state({ path: 'a.agent' }));
    store.publish('p', state({ path: 'b.agent' }), 't1');
    expect(store.get('p', 't1')?.state.path).toBe('b.agent');
    expect(store.get('p', 'other')?.state.path).toBe('a.agent');
    expect(store.latest('p')?.state.path).toBe('b.agent');
    store.publish('p', state({ share: false }), 't1');
    expect(store.get('p', 't1')?.state.path).toBe('a.agent');
    t += VIEW_TTL_MS + 1;
    expect(store.get('p')).toBeNull();
    expect(store.latest('p')).toBeNull();
  });

  it('bounds the number of entries, dropping the oldest', () => {
    let t = 0; const store = new StudioViewStore(() => ++t);
    for (let i = 0; i < VIEW_MAX_ENTRIES + 10; i++) store.publish(`p${i}`, state());
    expect(store.size).toBe(VIEW_MAX_ENTRIES);
    expect(store.get('p0')).toBeNull();
    expect(store.get(`p${VIEW_MAX_ENTRIES + 9}`)).not.toBeNull();
  });

  it('shares one store per plugin instance', () => {
    const zcc = {};
    expect(viewStoreFor(zcc)).toBe(viewStoreFor(zcc));
    expect(viewStoreFor({})).not.toBe(viewStoreFor(zcc));
  });

  it('retains both agent windows and never falls back to another script for a bound assistant', () => {
    let now = 1000;
    const store = new StudioViewStore(() => now);
    store.publish('p', state({ path: 'a.agent', orgAlias: 'a-org' }));
    store.bindThread('p', 'assistant-a', 'a.agent');
    store.publish('p', state({ path: 'b.agent', orgAlias: 'b-org' }));
    expect(store.get('p', 'assistant-a')?.state.path).toBe('a.agent');
    expect(store.latest('p', 'b.agent')?.state.orgAlias).toBe('b-org');
    expect(store.latest('p')?.state.path).toBe('b.agent');
    expect(buildViewInstructions(store, { projectId: 'p', threadId: 'assistant-a' })).toContain('a.agent');
    store.publish('p', state({ path: 'a.agent', share: false }));
    expect(store.get('p', 'assistant-a')).toBeNull();
    expect(buildViewInstructions(store, { projectId: 'p', threadId: 'assistant-a' })).toBeNull();
    expect(store.latest('p', 'b.agent')).not.toBeNull();
    store.publish('p', state({ path: 'a.agent' }));
    now += VIEW_TTL_MS + 1;
    expect(store.latest('p', 'a.agent')).toBeNull();
  });

  it('bounds thread bindings and keeps the same thread name separate across projects', () => {
    const store = new StudioViewStore();
    store.bindThread('p', 'same', 'a.agent');
    store.bindThread('other', 'same', 'b.agent');
    expect(store.threadPath('p', 'same')).toBe('a.agent');
    expect(store.threadPath('other', 'same')).toBe('b.agent');
    for (let i = 0; i < 1000; i++) store.bindThread('p', `thread-${i}`, 'a.agent');
    expect(store.threadPath('p', 'same')).toBeUndefined();
    expect(store.threadPath('p', 'thread-999')).toBe('a.agent');
  });

  it('rejects late publishes and duplicate sequences after a publisher withdraws', () => {
    let now = 1000;
    const store = new StudioViewStore(() => now);
    expect(store.publish('p', state(), 't', { id: 'window-a', sequence: 1 })).toBe(true);
    expect(store.publish('p', state({ share: false }), 't', { id: 'window-a', sequence: 3 })).toBe(false);
    now += 300_001; // Still protected after the host's 300s request timeout.
    expect(store.publish('p', state(), 't', { id: 'window-a', sequence: 2 })).toBe(false);
    expect(store.publish('p', state(), 't', { id: 'window-a', sequence: 3 })).toBe(false);
    expect(store.get('p', 't')).toBeNull();
    expect(store.publish('p', state({ cursor: { line: 9, column: 1 } }), 't', { id: 'window-a', sequence: 4 })).toBe(true);
    expect(store.get('p', 't')?.state.cursor?.line).toBe(9);
  });

  it('retains independent publishers of the same path and withdraws only its owner', () => {
    const store = new StudioViewStore();
    store.publish('p', state({ cursor: { line: 1, column: 1 } }), null, { id: 'window-a', sequence: 1 });
    store.publish('p', state({ cursor: { line: 2, column: 1 } }), null, { id: 'window-b', sequence: 1 });
    expect(store.latest('p')?.state.cursor?.line).toBe(2);
    store.publish('p', state({ share: false }), null, { id: 'window-b', sequence: 2 });
    expect(store.latest('p')?.state.cursor?.line).toBe(1);
    store.publish('p', state({ share: false }), null, { id: 'window-a', sequence: 2 });
    expect(store.latest('p')).toBeNull();
  });

  it('replaces the publisher previous path even when its old-path withdrawal arrives late', () => {
    const store = new StudioViewStore();
    store.publish('p', state({ path: 'a.agent' }), null, { id: 'window', sequence: 1 });
    store.bindThread('p', 'assistant-a', 'a.agent');
    store.publish('p', state({ path: 'b.agent' }), null, { id: 'window', sequence: 3 });
    store.publish('p', state({ path: 'a.agent', share: false }), null, { id: 'window', sequence: 2 });
    expect(store.latest('p', 'a.agent')).toBeNull();
    expect(store.get('p', 'assistant-a')).toBeNull();
    expect(store.latest('p')?.state.path).toBe('b.agent');
  });

  it('scopes publisher ordering to its authoritative project and thread', () => {
    const store = new StudioViewStore();
    store.publish('p', state(), 'one', { id: 'same', sequence: 9 });
    expect(store.publish('other', state(), 'one', { id: 'same', sequence: 1 })).toBe(true);
    expect(store.publish('p', state(), 'two', { id: 'same', sequence: 1 })).toBe(true);
    store.publish('p', state({ share: false }), 'one', { id: 'same', sequence: 10 });
    expect(store.get('p', 'one')).toBeNull();
    expect(store.get('other', 'one')).not.toBeNull();
    expect(store.get('p', 'two')).not.toBeNull();
  });

  it('keeps tombstones bounded without evicting fresh ordering protection', () => {
    let now = 1000;
    const store = new StudioViewStore(() => now);
    for (let i = 0; i < VIEW_MAX_PUBLISHERS; i++) store.publish('p', state({ share: false }), null, { id: `window-${i}`, sequence: 2 });
    expect(store.size).toBe(0);
    expect(store.publish('p', state(), null, { id: 'new-window', sequence: 1 })).toBe(false);
    expect(store.publish('p', state(), null, { id: 'window-0', sequence: 1 })).toBe(false);
    expect(store.publish('p', state(), null, { id: 'window-0', sequence: 3 })).toBe(true);
    now += VIEW_PUBLISHER_TTL_MS + 1;
    expect(store.publish('p', state(), null, { id: 'new-window', sequence: 1 })).toBe(true);
    expect(store.latest('p')?.publisherId).toBe('new-window');
    now += VIEW_TTL_MS + 1;
    expect(store.latest('p')).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe('describeView / instructions', () => {
  const full = state({ dirty: true, orgAlias: 'dev', selection: { startLine: 2, endLine: 4, text: 'a\nb' }, lastRun: { runId: 'r1', engine: 'simulate', turn: 2 }, diagnostics: Array.from({ length: 8 }, (_, i) => ({ line: i + 1, column: 1, endLine: i + 1, endColumn: 2, severity: 'warning' as const, message: 'm' })) });
  it('renders the screen compactly', () => {
    const text = describeView(full, 9000);
    expect(text).toContain('org: dev');
    expect(text).toContain('unsaved edits');
    expect(text).toContain('Selection: lines 2-4: "a b"');
    expect(text).toContain('simulate, turn 2');
    expect(text).toContain('Problems (8):');
    expect(text).toContain('updated 9s ago');
    expect(describeView(state({ path: null, cursor: { line: 4, column: 1 }, tool: null }))).toContain('(unsaved draft)');
    expect(describeView(state({ cursor: { line: 4, column: 1 }, lastRun: { runId: 'r', engine: 'live' } }))).toContain('Cursor: line 4');
  });

  it('builds a bounded instruction section only when a view exists', () => {
    const store = new StudioViewStore();
    expect(buildViewInstructions(store, { projectId: '', threadId: 't' })).toBeNull();
    expect(buildViewInstructions(store, { projectId: 'p', threadId: 't' })).toBeNull();
    store.publish('p', state({ selection: { startLine: 1, endLine: 2, text: 'x'.repeat(2000) }, orgAlias: 'o'.repeat(2000) }));
    const text = buildViewInstructions(store, { projectId: 'p', threadId: 't' })!;
    expect(text).toContain('currently viewing');
    expect(text).toContain('view.state');
    expect(text.length).toBeLessThanOrEqual(INSTRUCTIONS_MAX_CHARS);
  });

  it('uses the host-bound script metadata before the latest project window', () => {
    const store = new StudioViewStore();
    store.publish('p', state({ path: 'a.agent' }));
    store.publish('p', state({ path: 'b.agent' }));
    expect(buildViewInstructions(store, { projectId: 'p', pluginMetadata: { panelAgent: { view: 'a.agent' } } })).toContain('File: a.agent');
    expect(buildViewInstructions(store, { projectId: 'p', pluginMetadata: { sfAgentPath: 'a.agent' } })).not.toContain('File: b.agent');
    expect(buildViewInstructions(store, { projectId: 'p', pluginMetadata: { panelAgent: { view: 'closed.agent' } } })).toBeNull();
  });

  it('distinguishes the owner agent from the currently viewed read-only resource', () => {
    const reference = { kind: 'flow' as const, apiName: 'BT_Modsol_AF_Billing_Journey', path: 'force-app/flows/BT_Modsol_AF_Billing_Journey.flow-meta.xml', source: 'project' as const };
    const shared = state({ path: 'GuiAgentReview_1.agent', reference, cursor: { line: 45, column: 1 }, selection: { startLine: 45, endLine: 46, text: 'hidden selection' }, diagnostics: full.diagnostics });
    const text = describeView(shared);
    expect(text).toContain('Owner agent: GuiAgentReview_1.agent');
    expect(text).toContain('Viewing: flow BT_Modsol_AF_Billing_Journey (read-only, source: project)');
    expect(text).toContain(`Reference file: ${reference.path}`);
    expect(text).toContain('Owner agent problems (8):');
    expect(text).not.toContain('hidden selection');
    expect(text).not.toContain('Cursor:');
    expect(describeView(state({ reference: { kind: 'apex', apiName: 'QuoteAction' } }))).toContain('Viewing: apex QuoteAction (read-only)');
    const store = new StudioViewStore();
    store.publish('p', shared);
    store.bindThread('p', 'assistant', 'GuiAgentReview_1.agent');
    expect(store.get('p', 'assistant')?.state.path).toBe('GuiAgentReview_1.agent');
    expect(buildViewInstructions(store, { projectId: 'p', threadId: 'assistant' })).toContain('Viewing: flow BT_Modsol_AF_Billing_Journey');
  });
});

describe('readOpenComments', () => {
  const c = (id: string, path: string, resolved?: object) => ({ id, path, line: 1, endLine: 1, quote: 'q', body: 'b', author: { kind: 'user', name: 'u' }, createdAt: 1, ...(resolved ? { resolved } : {}) });
  it('filters open comments for the path from either doc shape and tolerates junk', async () => {
    const rows = [c('a', 'x.agent'), c('b', 'y.agent'), c('r', 'x.agent', { at: 1, note: 'n', by: 't' }), { junk: true }];
    expect((await readOpenComments({ get: async () => rows as any }, 'p', 'x.agent')).map(x => x.id)).toEqual(['a']);
    expect((await readOpenComments({ get: async () => ({ comments: rows }) as any }, 'p', null)).map(x => x.id)).toEqual(['a', 'b']);
    expect(await readOpenComments({ get: async () => 5 as any }, 'p', null)).toEqual([]);
    expect(await readOpenComments({ get: async () => { throw new Error('x'); } }, 'p', null)).toEqual([]);
  });
});

describe('registerStudioContext', () => {
  it('registers rpc, one instruction provider and two mention providers', () => {
    const h = harness();
    expect([...h.handlers.keys()]).toEqual([STUDIO_RPC.viewPublish, STUDIO_RPC.viewGet]);
    expect(h.providers).toHaveLength(1);
    expect([...h.mentions.keys()]).toEqual(['sf-agent', 'sf-view']);
  });

  it('publishes, reads back and honours share=false and validation', () => {
    const h = harness();
    expect(h.call(STUDIO_RPC.viewGet, {}).shared).toBe(false);
    expect(h.call(STUDIO_RPC.viewPublish, { state: { nope: 1 } }).code).toBe('invalid_input');
    expect(h.call(STUDIO_RPC.viewPublish, { state: state({ diagnostics: Array.from({ length: 51 }, () => ({ line: 1, column: 1, endLine: 1, endColumn: 1, severity: 'error', message: 'x' })) as any }) }).code).toBe('invalid_input');
    expect(h.call(STUDIO_RPC.viewPublish, { state: state(), threadId: 't9' })).toEqual({ ok: true, shared: true });
    const got = h.call(STUDIO_RPC.viewGet, { threadId: 't9' });
    expect(got).toMatchObject({ ok: true, shared: true });
    expect(got.summary).toContain('Help.agent');
    expect(h.providers[0]({ projectId: 'p1', threadId: 't9' })).toContain('Help.agent');
    expect(h.call(STUDIO_RPC.viewPublish, { state: state({ share: false }), threadId: 't9' }).shared).toBe(false);
    expect(h.call(STUDIO_RPC.viewGet, { threadId: 't9' }).shared).toBe(false);
  });

  it('requires a project and swallows provider failures', () => {
    const h = harness('');
    expect(h.call(STUDIO_RPC.viewPublish, { state: state() }).code).toBe('project_required');
    expect(h.call(STUDIO_RPC.viewGet, {}).code).toBe('project_required');
    expect(h.providers[0]({ projectId: '', threadId: 't' })).toBeNull();
  });

  it('validates optional publisher envelopes and keeps legacy publishes compatible', () => {
    const h = harness();
    for (const publisher of [null, [], {}, { id: '', sequence: 1 }, { id: 'x'.repeat(101), sequence: 1 }, { id: '../bad', sequence: 1 }, { id: 'valid', sequence: 0 }, { id: 'valid', sequence: 1.5 }, { id: 'valid', sequence: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(h.call(STUDIO_RPC.viewPublish, { state: state(), publisher }).code).toBe('invalid_input');
    }
    expect(h.call(STUDIO_RPC.viewPublish, { state: state(), publisher: { id: 'uuid-A_1', sequence: 1 } })).toEqual({ ok: true, shared: true });
    expect(h.call(STUDIO_RPC.viewPublish, { state: state({ share: false }), publisher: { id: 'uuid-A_1', sequence: 3 } }).shared).toBe(false);
    expect(h.call(STUDIO_RPC.viewPublish, { state: state(), publisher: { id: 'uuid-A_1', sequence: 2 } }).shared).toBe(false);
    expect(h.call(STUDIO_RPC.viewGet, {}).state).toBeNull();
    expect(h.call(STUDIO_RPC.viewPublish, { state: state() }).shared).toBe(true);
    expect(h.call(STUDIO_RPC.viewPublish, { state: state({ share: false }) }).shared).toBe(false);
  });

  it('logs instead of throwing when instructions are already registered', () => {
    const warn = vi.fn();
    const zcc: any = { agents: { contributeInstructions: () => { throw new Error('already registered'); } }, ui: { registerMentionProvider: () => undefined }, storage: { kv: { get: async () => undefined } }, log: { warn } };
    registerStudioContext({ zcc, registerRpc: () => undefined, contexts: { current: () => undefined } } as any);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already registered'));
  });

  it('mention providers search and resolve file, comments and current screen', async () => {
    const h = harness();
    const agent = h.mentions.get('sf-agent'); const view = h.mentions.get('sf-view');
    expect(agent.search({ query: '', projectId: 'p1' })).toEqual([]);
    expect(view.search({ query: '', projectId: 'p1' })).toEqual([]);
    h.call(STUDIO_RPC.viewPublish, { state: state({ diagnostics: [{ line: 3, column: 1, endLine: 3, endColumn: 2, severity: 'error', message: 'boom' }] }) });
    h.kv.set('studio:comments:p1', [{ id: 'c1', path: 'force-app/Help.agent', line: 1, endLine: 1, quote: 'q', body: 'do it', author: { kind: 'user', name: 'u' }, createdAt: 1 }]);
    expect(agent.search('', )).toEqual([]);
    expect(agent.search({ query: 'zzz', projectId: 'p1' })).toEqual([]);
    expect(agent.search({ query: '', projectId: '' })).toEqual([]);
    const items = agent.search({ query: 'help', projectId: 'p1' });
    expect(items).toHaveLength(2);
    const file = await agent.resolve(items[0].id);
    expect(file.context).toContain('force-app/Help.agent');
    expect(file.context).toContain('do it');
    expect(file.context).toContain('boom');
    expect((await agent.resolve(items[1].id)).context).not.toContain('boom');
    await expect(agent.resolve('bogus')).rejects.toThrow();
    expect(view.search('', )).toEqual([]);
    expect(view.search({ query: 'nothing', projectId: 'p1' })).toEqual([]);
    const [screen] = view.search({ query: 'screen', projectId: 'p1' });
    expect((await view.resolve(screen.id)).context).toContain('Help.agent');
    expect((await view.resolve('view~gone')).context).toContain('not being shared');
    expect((await view.resolve('view')).context).toContain('not being shared');
  });
});

import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, mkdir, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SalesforceToolkitAdapter, providerTools, toolkitNativeSchema, toolProvider } from '../lib/toolkit-adapter.js';
import type { SalesforceSdk } from '../lib/sdk-contract.js';
import type { SalesforceToolProvider, ToolkitRuntime } from '../lib/tool-provider-contract.js';
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });
async function setup(executionWorkspace?: (name: string, workspace: string) => string | Promise<string>) {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'sf-adapter-'))); cleanups.push(() => rm(workspace, { recursive: true, force: true }));
  let mode: SalesforceToolProvider = 'both';
  const scope = { projectId: 'p', workspace, orgAlias: 'dev' };
  const org = { orgId: '00D1', alias: 'dev', username: 'dev@example.com', kind: 'sandbox' };
  const connect = vi.fn(async () => org);
  const confirm = vi.fn(async () => ({ approved: true, reason: 'sandbox' }));
  const runtime: ToolkitRuntime = {
    executeTool: vi.fn(async (_name, _input, options) => {
      const id = randomUUID(), dir = join(options.artifactDir, id); await mkdir(dir);
      const runFile = join(dir, 'run.json'), resultFile = join(dir, 'result.json');
      await writeFile(runFile, '{}'); await writeFile(resultFile, JSON.stringify({ data: { value: 'evidence' } }));
      return { ok: true, data: { accessToken: 'secret', value: 'evidence' }, execution: { runId: id, runFile, resultFile } };
    }),
    toModelResult: vi.fn(result => structuredClone(result)),
    readResult: vi.fn(async () => ({ data: { value: 'evidence', password: 'secret' } }))
  };
  const loadRuntime = vi.fn(async () => runtime);
  const changed = vi.fn();
  const adapter = new SalesforceToolkitAdapter({ provider: async () => mode, scope: async () => ({ ...scope }), sdk: { connect, confirm } as unknown as SalesforceSdk, loadRuntime, changed, executionWorkspace });
  cleanups.push(() => adapter.dispose());
  return { adapter, scope, org, runtime, connect, confirm, loadRuntime, changed, setMode: (value: SalesforceToolProvider) => { mode = value; } };
}
const ctx = { projectId: 'p', threadId: 't' };

describe('provider boundary', () => {
  it('selects independent catalogs and strips host authority from direct schemas', () => {
    expect(toolProvider('bad')).toBe('both'); expect(toolProvider('builtin')).toBe('builtin'); expect(toolProvider('toolkit')).toBe('toolkit');
    expect(providerTools('builtin', true)).toEqual(['sf_soql', 'sf_apex', 'sf_lwc', 'sf_agent', 'sf_workbench']);
    expect(providerTools('builtin', false)).toEqual(['sf_workbench', 'sf_agent']);
    expect(providerTools('toolkit', true)).toEqual(['sf_workbench', 'sf_tools', 'sf_flow', 'code_analyzer', 'sf_metadata']);
    expect(providerTools('both', false)).toContain('sf_agent');
    expect(toolkitNativeSchema('sf_flow').properties).not.toHaveProperty('target_org');
    expect(toolkitNativeSchema('sf_flow').properties).not.toHaveProperty('workspace');
    expect(toolkitNativeSchema('sf_flow').properties).toHaveProperty('resumeId');
  });
  it('discovers without loading SDK; built-in mode refuses stale calls', async () => {
    const f = await setup();
    expect((await f.adapter.catalog()).tools).toHaveLength(21);
    expect(await f.adapter.describe('sf_soql')).toMatchObject({ ok: true, actions: { 'query.run': { available: true } } });
    expect(await f.adapter.describe('bad')).toMatchObject({ code: 'unknown_tool' });
    f.setMode('builtin'); expect(await f.adapter.invoke('sf_flow', {}, ctx)).toMatchObject({ code: 'provider_disabled' });
    expect(await f.adapter.read('bad', ctx)).toMatchObject({ code: 'provider_disabled' }); expect(f.loadRuntime).not.toHaveBeenCalled();
  });
});

describe('host-owned execution', () => {
  it('pins child execution for approvals and resumes while retaining registered-project result ownership', async () => {
    let selected = 'agentforce-drafts';
    const f = await setup((name, workspace) => name === 'sf_lwc' ? join(workspace, selected) : workspace);
    await mkdir(join(f.scope.workspace, selected)); await mkdir(join(f.scope.workspace, 'other'));
    const result = await f.adapter.invoke('sf_lwc', { action: 'component.inspect', component: 'qaHello', workspace: '.' }, ctx);
    expect(f.runtime.executeTool).toHaveBeenLastCalledWith('sf_lwc', expect.objectContaining({ workspace: join(f.scope.workspace, selected) }), expect.objectContaining({ workspace: join(f.scope.workspace, selected), allowEffects: false }));
    expect(await f.adapter.read(result.execution.runId, ctx)).toMatchObject({ data: { value: 'evidence' } });
    await f.adapter.invoke('sf_lwc', { action: 'component.inspect', component: 'qaHello', output_files: [{ path: 'agentforce-drafts/report.json', content: '{}' }] }, ctx);
    expect(f.runtime.executeTool).toHaveBeenLastCalledWith('sf_lwc', expect.objectContaining({ output_files: [{ path: join(f.scope.workspace, selected, 'report.json'), content: '{}' }] }), expect.objectContaining({ workspace: join(f.scope.workspace, selected), allowEffects: true }));
    selected = 'other';
    expect(await f.adapter.invoke('sf_lwc', { action: 'history.last' }, ctx, result.execution.runId)).toMatchObject({ code: 'scope_mismatch' });
    f.confirm.mockImplementation(async () => { selected = 'agentforce-drafts'; return { approved: true, reason: 'sandbox' }; });
    expect(await f.adapter.invoke('sf_lwc', { action: 'test.run', component: 'qaHello' }, ctx)).toMatchObject({ code: 'scope_mismatch' });
    expect(f.runtime.executeTool).toHaveBeenCalledTimes(2);
    expect(f.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'org.write' }), 't');
  });
  it('rejects host execution roots outside the registered project before approval or runtime loading', async () => {
    const f = await setup(() => '/');
    expect(await f.adapter.invoke('sf_lwc', { action: 'project.scan' }, ctx)).toMatchObject({ code: 'toolkit_failed', error: expect.stringContaining('inside') });
    expect(f.confirm).not.toHaveBeenCalled(); expect(f.loadRuntime).not.toHaveBeenCalled();
  });
  it('announces only completed local retrieve results, follows resumes and deduplicates one download', async () => {
    const f = await setup();
    const original = f.runtime.executeTool;
    const output = join(f.scope.workspace, 'retrieved');
    let data: Record<string, unknown> = { submitted: true, job_id: '09S000000000001', output_dir: output };
    let status = 'pending';
    f.runtime.executeTool = vi.fn(async (...args) => ({ ...await original(...args), status, data }));
    const submitted = await f.adapter.invoke('sf_metadata', { action: 'retrieve', output_dir: 'retrieved', metadata: [{ type: 'Flow', fullName: 'Review' }] }, ctx);
    expect(f.runtime.executeTool).toHaveBeenLastCalledWith('sf_metadata', expect.objectContaining({ output_dir: output }), expect.anything());
    expect(f.changed).not.toHaveBeenCalled();
    const initiating = submitted.execution.runId;
    status = 'success'; data = { job_id: '09S000000000001', status: { done: true, success: true } };
    const checked = await f.adapter.invoke('sf_metadata', { action: 'retrieve.status' }, ctx, initiating);
    expect(f.changed).not.toHaveBeenCalled();
    for (const files of [[], [{ state: 'Unchanged' }], [{ state: 'Failed' }]]) {
      data = { done: true, job_id: '09S000000000001', output_dir: output, files };
      await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, ctx, checked.execution.runId);
      expect(f.changed).not.toHaveBeenCalled();
    }
    data = { done: true, job_id: '09S000000000001', output_dir: output, files: [{ state: 'Created', filePath: join(output, 'Review.flow-meta.xml') }] };
    const downloaded = await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, ctx, checked.execution.runId);
    expect(f.changed.mock.calls).toEqual([[{ projectId: 'p' }]]);
    await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, ctx, initiating);
    await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, ctx, downloaded.execution.runId);
    expect(f.changed).toHaveBeenCalledTimes(1);
    await f.adapter.invoke('sf_metadata', { action: 'retrieve.status' }, ctx);
    expect(f.changed).toHaveBeenCalledTimes(1);
  });
  it('does not announce failed, pending, unbound, mismatched or cancelled metadata downloads', async () => {
    const f = await setup(); const original = f.runtime.executeTool;
    const output = join(f.scope.workspace, 'retrieved');
    let data: Record<string, unknown> = { submitted: true, job_id: '09S000000000001', output_dir: output };
    let ok = true, status = 'pending';
    f.runtime.executeTool = vi.fn(async (...args) => ({ ...await original(...args), ok, status, data }));
    const started = await f.adapter.invoke('sf_metadata', { action: 'retrieve', output_dir: output, metadata: [{ type: 'Flow', fullName: 'Review' }] }, ctx);
    const complete = { done: true, job_id: '09S000000000001', output_dir: output, files: [{ state: 'Changed' }] };
    for (const change of [
      { ok: false, status: 'error', data: complete },
      { ok: true, status: 'pending', data: complete },
      { ok: true, status: 'success', data: { ...complete, done: false } },
      { ok: true, status: 'success', data: { ...complete, job_id: '09S000000000002' } },
      { ok: true, status: 'success', data: { ...complete, output_dir: join(output, 'other') } }
    ]) {
      ({ ok, status, data } = change);
      await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, ctx, started.execution.runId);
    }
    data = complete;
    await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, ctx);
    const abort = new AbortController();
    f.runtime.executeTool = vi.fn(async (...args) => { const result = await original(...args); abort.abort(); return { ...result, ok: true, data: complete }; });
    expect(await f.adapter.invoke('sf_metadata', { action: 'retrieve.result' }, { ...ctx, signal: abort.signal }, started.execution.runId)).toMatchObject({ code: 'interrupted' });
    expect(f.changed).not.toHaveBeenCalled();
  });
  it('does not bind an omitted retrieve destination, which the installed toolkit rejects', async () => {
    const f = await setup();
    f.runtime.executeTool = vi.fn(async () => ({ ok: false, status: 'error', error: { code: 'INPUT', message: 'retrieve requires output_dir.' } }));
    expect(await f.adapter.invoke('sf_metadata', { action: 'retrieve', metadata: [{ type: 'Flow', fullName: 'Review' }] }, ctx)).toMatchObject({ ok: false, error: { code: 'INPUT' } });
    expect(f.changed).not.toHaveBeenCalled();
  });
  it('announces changed Flow quick fixes for their original project, never reads or unchanged/failed fixes', async () => {
    const f = await setup(), file = join(f.scope.workspace, 'Review.flow-meta.xml');
    await writeFile(file, '<Flow>before</Flow>');
    let source = '<Flow>after</Flow>', ok = true;
    f.runtime.executeTool = vi.fn(async () => { await writeFile(file, source); return { ok, status: ok ? 'success' : 'error' }; });
    const input = { action: 'fix.apply', file, fix_id: 'canvas', source_version: 'before' };
    await f.adapter.invoke('sf_flow', input, ctx);
    expect(f.changed.mock.calls).toEqual([[{ projectId: 'p', path: 'Review.flow-meta.xml' }]]);
    f.changed.mockClear();
    await f.adapter.invoke('sf_flow', input, ctx);
    source = '<Flow>changed but failed</Flow>'; ok = false;
    await f.adapter.invoke('sf_flow', input, ctx);
    ok = true;
    await f.adapter.invoke('sf_flow', { action: 'diagnose.file', file }, ctx);
    await f.adapter.invoke('sf_metadata', { action: 'deploy.status', job_id: '0Af000000000001' }, ctx);
    expect(f.changed).not.toHaveBeenCalled();
    source = '<Flow>original project</Flow>';
    f.runtime.executeTool = vi.fn(async () => { f.scope.projectId = 'other'; await writeFile(file, source); return { ok: true }; });
    await f.adapter.invoke('sf_flow', input, ctx);
    expect(f.changed.mock.calls).toEqual([[{ projectId: 'p', path: 'Review.flow-meta.xml' }]]);
  });
  it('keeps successful writes successful if realtime fails, and ignores unavailable Flow revisions', async () => {
    const f = await setup(), file = join(f.scope.workspace, 'Review.flow-meta.xml');
    await writeFile(file, 'before');
    f.changed.mockImplementation(() => { throw Error('realtime unavailable'); });
    f.runtime.executeTool = vi.fn(async () => { await writeFile(file, 'after'); return { ok: true }; });
    expect(await f.adapter.invoke('sf_flow', { action: 'fix.apply', file }, ctx)).toMatchObject({ ok: true });
    expect(f.changed).toHaveBeenCalledTimes(1); f.changed.mockClear();
    f.runtime.executeTool = vi.fn(async () => ({ ok: true }));
    await f.adapter.invoke('sf_flow', { action: 'fix.apply' }, ctx);
    await f.adapter.invoke('sf_flow', { action: 'fix.apply', file: f.scope.workspace }, ctx);
    await f.adapter.invoke('sf_flow', { action: 'fix.apply', file: join(f.scope.workspace, 'missing.flow-meta.xml') }, ctx);
    expect(f.changed).not.toHaveBeenCalled();
  });
  it('allows local diagnostics without org, redacts results and supports opaque evidence/resume', async () => {
    const f = await setup(); f.scope.orgAlias = '';
    const result = await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx);
    expect(result).toMatchObject({ ok: true, data: { accessToken: '[redacted]' } });
    expect(Object.keys(result.execution)).toEqual(['runId']); expect(f.connect).not.toHaveBeenCalled();
    expect(await f.adapter.read(result.execution.runId, ctx, { limit: 1000 })).toMatchObject({ data: { password: '[redacted]' } });
    expect(f.runtime.readResult).toHaveBeenCalledWith(expect.any(String), { limit: 100 });
    await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx, result.execution.runId);
    expect(f.runtime.executeTool).toHaveBeenLastCalledWith('sf_flow', expect.anything(), expect.objectContaining({ workspace: f.scope.workspace, resume: expect.stringContaining('run.json'), allowEffects: false }));
    await f.adapter.read(result.execution.runId, ctx, { limit: NaN }); expect(f.runtime.readResult).toHaveBeenLastCalledWith(expect.anything(), { limit: 20 });
  });
  it('pins org username and asks approval for effects, never granting a caller override', async () => {
    const f = await setup();
    await f.adapter.invoke('sf_soql', { action: 'query.run', query: 'SELECT Id FROM Account LIMIT 1', target_org: 'dev' }, ctx);
    expect(f.runtime.executeTool).toHaveBeenCalledWith('sf_soql', expect.objectContaining({ target_org: 'dev@example.com' }), expect.objectContaining({ allowEffects: false }));
    await f.adapter.invoke('sf_apex', { action: 'test.run' }, ctx);
    expect(f.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'org.write', orgId: '00D1', fingerprint: expect.any(String) }), 't');
    expect(f.runtime.executeTool).toHaveBeenLastCalledWith('sf_apex', expect.anything(), expect.objectContaining({ allowEffects: true }));
    expect(await f.adapter.invoke('sf_apex', { action: 'test.run', allowEffects: true }, ctx)).toMatchObject({ ok: false });
    f.confirm.mockResolvedValue({ approved: false, reason: 'denied' });
    expect(await f.adapter.invoke('sf_flow', { action: 'fix.apply' }, ctx)).toMatchObject({ code: 'refused' });
  });
  it('rejects absent/changed org, cross-project result/resume and changed approval context', async () => {
    const f = await setup();
    const result = await f.adapter.invoke('sf_soql', { action: 'status' }, ctx);
    f.org.orgId = 'other'; expect(await f.adapter.read(result.execution.runId, ctx)).toMatchObject({ code: 'scope_mismatch' });
    expect(await f.adapter.invoke('sf_soql', { action: 'status' }, ctx, result.execution.runId)).toMatchObject({ code: 'scope_mismatch' });
    f.scope.projectId = 'other'; expect(await f.adapter.read(result.execution.runId, ctx)).toMatchObject({ code: 'scope_mismatch' }); f.scope.projectId = 'p';
    f.scope.orgAlias = ''; expect(await f.adapter.invoke('sf_soql', { action: 'status' }, ctx)).toMatchObject({ code: 'org_required' });
    expect(await f.adapter.read('missing', ctx)).toMatchObject({ code: 'scope_mismatch' });
    f.confirm.mockImplementation(async () => { f.scope.orgAlias = 'changed'; return { approved: true, reason: 'sandbox' }; });
    expect(await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ code: 'scope_mismatch' });
  });
  it('rechecks provider after approval, rejects unknown tools and handles runtime failures', async () => {
    const f = await setup();
    expect(await f.adapter.invoke('unknown', {}, ctx)).toMatchObject({ code: 'unknown_tool' });
    f.confirm.mockImplementationOnce(async () => { f.setMode('builtin'); return { approved: true, reason: 'sandbox' }; });
    expect(await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ code: 'provider_disabled' });
    f.setMode('both'); f.loadRuntime.mockRejectedValueOnce(Error('missing runtime'));
    expect(await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ code: 'toolkit_failed' });
    f.runtime.readResult = vi.fn(async () => { throw Error('missing evidence'); });
    const r = await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx);
    expect(await f.adapter.read(r.execution.runId, ctx)).toMatchObject({ code: 'toolkit_failed' });
  });
  it('bounds concurrency, propagates cancellation and cleans evidence on disposal', async () => {
    const f = await setup();
    const r = await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx);
    const options = vi.mocked(f.runtime.executeTool).mock.calls[0][2];
    f.runtime.executeTool = vi.fn(async (_n, _i, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })));
    const controller = new AbortController();
    const calls = Array.from({ length: 4 }, () => f.adapter.invoke('sf_flow', { action: 'quality.rules' }, { ...ctx, signal: controller.signal }));
    await vi.waitFor(() => expect(f.runtime.executeTool).toHaveBeenCalledTimes(4));
    expect(await f.adapter.invoke('sf_flow', {}, ctx)).toMatchObject({ code: 'busy' }); controller.abort();
    expect(await Promise.all(calls)).toEqual(Array.from({ length: 4 }, () => expect.objectContaining({ code: 'interrupted' })));
    expect(await f.adapter.invoke('sf_flow', {}, { ...ctx, signal: controller.signal })).toMatchObject({ code: 'interrupted' });
    await f.adapter.dispose(); expect(await stat(options.artifactDir).catch(() => null)).toBeNull();
    expect(await f.adapter.invoke('sf_flow', {}, ctx)).toMatchObject({ code: 'unavailable' }); expect(await f.adapter.read(r.execution.runId, ctx)).toMatchObject({ code: 'provider_disabled' });
  });
  it('evicts older evidence, cleans unsuccessful calls and rejects foreign execution paths', async () => {
    const f = await setup(); let first: any;
    for (let i = 0; i < 33; i++) { const r = await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx); if (!i) first = r; }
    expect(await f.adapter.read(first.execution.runId, ctx)).toMatchObject({ code: 'scope_mismatch' });
    const options = vi.mocked(f.runtime.executeTool).mock.calls[0][2]; expect(await stat(options.artifactDir).catch(() => null)).toBeNull();
    f.runtime.executeTool = vi.fn(async () => ({ ok: false, error: { code: 'INPUT' } }));
    expect(await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ ok: false });
    const emptyDir = vi.mocked(f.runtime.executeTool).mock.calls[0][2].artifactDir; expect(await stat(emptyDir).catch(() => null)).toBeNull();
    f.runtime.executeTool = vi.fn(async () => ({ ok: true, execution: { runId: randomUUID(), runFile: '/outside/run.json', resultFile: '/outside/result.json' } }));
    expect(await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ code: 'toolkit_failed' });
    f.runtime.executeTool = vi.fn(async (_n, _i, opts) => { await symlink(f.scope.workspace, join(opts.artifactDir, 'link')); return { ok: true }; });
    expect(await f.adapter.invoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ code: 'toolkit_failed' });
  });
});

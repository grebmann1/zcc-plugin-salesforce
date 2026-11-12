import { mkdtemp, mkdir, rm, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createFakePluginHost } from '@zana-ai/zcc-plugin-sdk/testing';
import { createSalesforcePlugin } from '../lib/plugin.js';
import { createNodeDeps } from '../lib/node-deps.js';
import type { SalesforcePluginSdk } from '../lib/sdk-contract.js';
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });
async function setup() {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'sf-plugin-toolkit-'))); cleanups.push(() => rm(path, { recursive: true, force: true }));
  await writeFile(join(path, 'sfdx-project.json'), '{"packageDirectories":[]}');
  const projects = [{ id: 'p', name: 'Local', path, local: true }, { id: 'remote', name: 'Remote', path, local: false }, { id: 'legacy', name: 'Unknown host', path }];
  const { zcc, harness } = createFakePluginHost({ pluginId: 'salesforce', listProjects: async () => projects }); cleanups.push(() => harness.dispose());
  const deps = createNodeDeps(); deps.execSf = async () => ({ code: 0, stdout: '{"result":{"sandboxes":[]}}', stderr: '' });
  const runtime = { executeTool: vi.fn(async () => ({ ok: true, data: { sentinel: 'toolkit' } })), toModelResult: (r: any) => r, readResult: vi.fn() };
  const load = vi.fn(async () => runtime);
  await createSalesforcePlugin(zcc, deps, undefined, load);
  const tool = (name: string) => harness.agentTools.find(t => t.name === name)!;
  return { zcc, harness, load, runtime, tool, path, deps };
}
it('wires provider modes across agent configuration, native tools, RPC, CLI and public SDK', async () => {
  const f = await setup(), ctx = { projectId: 'p', threadId: 't', signal: new AbortController().signal };
  const configure = () => f.harness.agentConfigurers[0]({ projectId: 'p' });
  expect((await configure())?.tools).toContain('sf_tools'); expect((await configure())?.skills).toContain('salesforce-toolkit');
  expect(await f.tool('sf_tools').execute({ action: 'describe', tool: 'data360_query' }, ctx)).toMatchObject({ ok: true, name: 'data360_query' });
  expect(await f.tool('sf_flow').execute({ action: 'quality.rules' }, ctx)).toMatchObject({ data: { sentinel: 'toolkit' } });
  expect(await f.harness.callRpc('toolkit.run', { projectId: 'p', action: 'call', tool: 'sf_flow', input: { action: 'quality.rules' } })).toMatchObject({ ok: true });
  const cli = await f.harness.cli!.run(['tool', 'sf_tools', '--input', '{"action":"list"}'], { pluginId: 'salesforce', argv: [], projectId: 'p' }); expect(JSON.parse(cli.stdout!)).toMatchObject({ tools: expect.any(Array) });
  const service = f.zcc.services.use<SalesforcePluginSdk>('salesforce'); expect(await service.toolCatalog()).toMatchObject({ provider: 'both' }); expect(await service.toolDescribe('sf_lwc')).toMatchObject({ name: 'sf_lwc' });
  expect(await service.toolInvoke('sf_flow', { action: 'quality.rules' }, ctx)).toMatchObject({ ok: true });
  expect(await service.toolReadResult('missing', ctx)).toMatchObject({ code: 'scope_mismatch' });
  f.harness.setSettings({ toolProvider: 'toolkit' });
  expect((await configure())?.tools).not.toContain('sf_apex'); expect((await configure())?.tools).toContain('sf_workbench');
  expect(await f.tool('sf_apex').execute({ action: 'diagnose' }, ctx)).toMatchObject({ code: 'provider_disabled' });
  expect(await f.tool('sf_lwc').execute({ action: 'diagnose' }, ctx)).toMatchObject({ code: 'provider_disabled' });
  f.harness.setSettings({ toolProvider: 'builtin' }); f.load.mockClear();
  expect((await configure())?.tools).toEqual(['sf_soql', 'sf_apex', 'sf_lwc', 'sf_agent', 'sf_workbench']);
  expect((await configure())?.skills).not.toContain('salesforce-toolkit');
  expect(await f.tool('sf_flow').execute({ action: 'quality.rules' }, ctx)).toMatchObject({ code: 'provider_disabled' }); expect(f.load).not.toHaveBeenCalled();
});
it('does not execute in remote/unregistered projects or accept invalid gateway actions', async () => {
  const f = await setup();
  const ctx = { projectId: 'remote', threadId: 't', signal: new AbortController().signal };
  expect(await f.tool('sf_tools').execute({ action: 'call', tool: 'sf_flow', input: { action: 'quality.rules' } }, ctx)).toMatchObject({ ok: false, error: expect.stringContaining('local project') });
  expect(await f.harness.callRpc('toolkit.run', { projectId: 'missing', action: 'call' })).toMatchObject({ ok: false });
  expect(await f.harness.callRpc('toolkit.run', { projectId: 'legacy', action: 'call', tool: 'sf_flow', input: { action: 'quality.rules' } })).toMatchObject({ ok: false, error: expect.stringContaining('attested') });
  expect(await f.tool('sf_tools').execute({ action: 'wrong' }, ctx)).toMatchObject({ code: 'invalid_input' }); expect(f.load).not.toHaveBeenCalled();
});
it('broadcasts successful Flow fixes from native, gateway and public SDK calls to the exact project', async () => {
  const f = await setup(), file = join(f.path, 'Review.flow-meta.xml');
  const ctx = { projectId: 'p', threadId: 't', signal: new AbortController().signal };
  await writeFile(file, 'before');
  let revision = 0;
  f.runtime.executeTool.mockImplementation(async () => { await writeFile(file, `changed ${++revision}`); return { ok: true, data: { sentinel: 'toolkit' } }; });
  const input = { action: 'fix.apply', file, fix_id: 'canvas', source_version: 'revision' };
  const approval = vi.spyOn(f.zcc.ui, 'requestInput');
  const approve = async (pending: Promise<unknown>, count: number) => {
    await vi.waitFor(() => expect(approval).toHaveBeenCalledTimes(count));
    f.harness.submitInteraction({ approved: true });
    return pending;
  };
  await approve(f.tool('sf_flow').execute(input, ctx) as Promise<unknown>, 1);
  await approve(f.tool('sf_tools').execute({ action: 'call', tool: 'sf_flow', input }, ctx) as Promise<unknown>, 2);
  await approve(f.zcc.services.use<SalesforcePluginSdk>('salesforce').toolInvoke('sf_flow', input, ctx), 3);
  expect(f.harness.published.filter(row => row.event === 'sf.studio.changed')).toEqual(Array.from({ length: 3 }, () => ({ event: 'sf.studio.changed', payload: { projectId: 'p', path: 'Review.flow-meta.xml', kind: 'files' } })));
});
it('broadcasts the Workbench retrieve completion only after approval and committed files', async () => {
  const f = await setup(); f.harness.setSettings({ defaultOrg: 'dev' });
  await mkdir(join(f.path, 'force-app'));
  f.deps.execSf = vi.fn(async args => ({ code: 0, stderr: '', stdout: JSON.stringify({ result: args.includes('display')
    ? { alias: 'dev', username: 'dev@example.com', orgId: '00D000000000001', instanceUrl: 'https://test.sandbox.my.salesforce.com', accessToken: 'fake', isSandbox: true, apiVersion: '66.0' }
    : { done: true, success: true, files: [{ state: 'Changed', filePath: join(f.path, 'One.cls') }] } }) }));
  const approval = vi.spyOn(f.zcc.ui, 'requestInput');
  const started = await f.harness.callRpc('operations.start', { projectId: 'p', threadId: 't', kind: 'retrieve.start', components: ['ApexClass:One'] }) as { ok: boolean; error?: string };
  expect(started.error).toBeUndefined();
  await vi.waitFor(() => expect(approval).toHaveBeenCalledTimes(1));
  expect(f.harness.published.filter(row => row.event === 'sf.studio.changed')).toEqual([]);
  f.harness.submitInteraction({ approved: true });
  await vi.waitFor(() => expect(f.harness.published).toContainEqual({ event: 'sf.studio.changed', payload: { projectId: 'p', kind: 'files' } }));
});

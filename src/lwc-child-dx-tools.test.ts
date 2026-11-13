import { mkdtemp, realpath, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createFakePluginHost } from '@zana-ai/zcc-plugin-sdk/testing';
import { createSalesforcePlugin } from '../lib/plugin.js';
import { createNodeDeps } from '../lib/node-deps.js';
import { toolkitRuntimeLoader } from '../lib/toolkit-runtime.js';
import type { SalesforcePluginSdk } from '../lib/sdk-contract.js';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const ctx = { projectId: 'p', threadId: 'qa', signal: new AbortController().signal };
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sf-lwc-family-child-'))); cleanups.push(() => rm(root, { recursive: true, force: true }));
  const save = async (path: string, content: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); };
  const child = join(root, 'agentforce-drafts'), relativeBundle = 'agentforce-drafts/force-app/main/default/lwc/qaHello';
  await save('agentforce-drafts/sfdx-project.json', '{"packageDirectories":[{"path":"force-app","default":true}],"namespace":"","sourceApiVersion":"66.0"}');
  await save(`${relativeBundle}/qaHello.js-meta.xml`, '<?xml version="1.0"?><LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata"><apiVersion>66.0</apiVersion><isExposed>false</isExposed></LightningComponentBundle>');
  await save(`${relativeBundle}/qaHello.js`, 'import { LightningElement, api } from "lwc"; export default class QaHello extends LightningElement { @api message; }');
  await save(`${relativeBundle}/qaHello.html`, '<template><p>{message}</p></template>');
  const { zcc, harness } = createFakePluginHost({ pluginId: 'salesforce', listProjects: async () => [{ id: 'p', name: 'Plugin repository', path: root, local: true }] }); cleanups.push(() => harness.dispose());
  const deps = createNodeDeps(); deps.execSf = vi.fn(async () => ({ code: 0, stdout: '{"result":{"sandboxes":[]}}', stderr: '' }));
  const runtime = await toolkitRuntimeLoader()();
  const execute = vi.fn(runtime.executeTool);
  await createSalesforcePlugin(zcc, deps, undefined, async () => ({ ...runtime, executeTool: execute }));
  const tool = (name: string) => harness.agentTools.find(row => row.name === name)!;
  return { root, child, relativeBundle, save, deps, zcc, harness, tool, execute };
}

it('dispatches built-in LWC tools and RPCs into the known child and preserves path selection', async () => {
  const f = await setup(), tool = f.tool('sf_lwc');
  expect(await tool.execute({ action: 'scan' }, ctx)).toMatchObject({ ok: true, data: [{ name: 'qaHello', dir: join(f.root, f.relativeBundle, 'qaHello') }] });
  for (const relativePath of [f.relativeBundle, 'force-app/main/default/lwc/qaHello', 'lwc/qaHello']) {
    expect(await tool.execute({ action: 'inspect', relativePath }, ctx)).toMatchObject({ ok: true, data: { name: 'qaHello', publicApi: ['message'] } });
  }
  expect(await tool.execute({ action: 'diagnose', component: 'qaHello' }, ctx)).toMatchObject({ ok: true, data: { issues: [] } });
  expect(await f.harness.callRpc('lwc.scan', { projectId: 'p' })).toMatchObject({ ok: true });
  expect(await tool.execute({ action: 'inspect', relativePath: '../other/qaHello' }, ctx)).toMatchObject({ code: 'path_refused' });
  expect(await tool.execute({ action: 'inspect', relativePath: 'other/qaHello' }, ctx)).toMatchObject({ code: 'not_found' });
  expect(await tool.execute({ action: 'test.jest', component: 'qaHello' }, ctx)).toMatchObject({ code: 'jest_missing' });
  await f.save('agentforce-drafts/node_modules/.bin/sfdx-lwc-jest', '#!/usr/bin/env node');
  f.deps.spawnContained = vi.fn(async () => ({ code: 0, stdout: 'PASS child bundle', stderr: '' }));
  expect(await tool.execute({ action: 'test.jest', component: 'qaHello' }, ctx)).toMatchObject({ ok: true });
  expect(f.deps.spawnContained).toHaveBeenCalledWith(join(f.child, 'node_modules/.bin/sfdx-lwc-jest'), ['--', 'qaHello'], f.child);
  await f.save('agentforce-drafts/sfdx-project.json', '{"packageDirectories":[{"path":"force-app"},{"path":"second"}]}');
  await f.save('agentforce-drafts/second/main/default/lwc/qaHello/qaHello.js-meta.xml', '<LightningComponentBundle/>');
  expect(await tool.execute({ action: 'inspect', component: 'qaHello' }, ctx)).toMatchObject({ code: 'ambiguous_component' });
  expect(await tool.execute({ action: 'inspect', component: 'qaHello', relativePath: 'second/main/default/lwc/qaHello' }, ctx)).toMatchObject({ ok: true, data: { dir: join(f.child, 'second/main/default/lwc/qaHello/qaHello') } });
  await rm(join(f.child, 'sfdx-project.json'));
  expect(await tool.execute({ action: 'scan' }, ctx)).toMatchObject({ code: 'not_configured' });
});

it('preserves registered-root DX execution in both local and packaged tools', async () => {
  const f = await setup();
  await f.save('sfdx-project.json', '{"packageDirectories":[{"path":"agentforce-drafts/force-app","default":true}],"namespace":"","sourceApiVersion":"66.0"}');
  expect(await f.tool('sf_lwc').execute({ action: 'inspect', relativePath: f.relativeBundle }, ctx)).toMatchObject({ ok: true, data: { publicApi: ['message'] } });
  const result = await f.tool('sf_tools').execute({ action: 'call', tool: 'sf_lwc', input: { action: 'component.inspect', component: 'qaHello' } }, ctx) as any;
  expect(result.error, JSON.stringify(result)).toBeUndefined(); expect(result.ok).toBe(true);
  expect(f.execute).toHaveBeenLastCalledWith('sf_lwc', expect.anything(), expect.objectContaining({ workspace: f.root }));
});

it('refuses root and managed manifests redirected outside before packaged toolkit dispatch', async () => {
  const f = await setup(), outside = await setup(), gateway = f.tool('sf_tools');
  for (const path of ['sfdx-project.json', 'agentforce-drafts/sfdx-project.json']) {
    if (path.startsWith('agentforce-drafts')) await rm(join(f.root, path));
    await symlink(join(outside.child, 'sfdx-project.json'), join(f.root, path));
    const result = await gateway.execute({ action: 'call', tool: 'sf_lwc', input: { action: 'project.scan' } }, ctx);
    expect(result).toMatchObject({ ok: false, code: 'toolkit_failed', error: expect.stringContaining('not configured') });
    expect(f.execute).not.toHaveBeenCalled();
    await rm(join(f.root, path));
  }
  // Native sf_lwc must not search the containing project's ancestors when no valid local DX root exists.
  expect(await gateway.execute({ action: 'call', tool: 'sf_lwc', input: { action: 'project.scan' } }, ctx)).toMatchObject({ code: 'toolkit_failed', error: expect.stringContaining('not configured') });
  expect(f.execute).not.toHaveBeenCalled();
});

it('refuses manifest packages outside the selected DX root before packaged toolkit dispatch', async () => {
  const f = await setup(), outside = await setup();
  await f.save('agentforce-drafts/sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: outside.child }] }));
  expect(await f.tool('sf_tools').execute({ action: 'call', tool: 'sf_lwc', input: { action: 'component.inspect', component: 'qaHello' } }, ctx)).toMatchObject({ code: 'toolkit_failed', error: expect.stringContaining('inside') });
  expect(f.execute).not.toHaveBeenCalled();
});

it('uses the real packaged toolkit through gateway and SDK with registered-root artifact ownership', async () => {
  const f = await setup(), gateway = f.tool('sf_tools');
  const inspected = await gateway.execute({ action: 'call', tool: 'sf_lwc', input: { action: 'component.inspect', component: 'qaHello' } }, ctx) as any;
  expect(inspected.error, JSON.stringify(inspected)).toBeUndefined(); expect(inspected.ok).toBe(true);
  expect(JSON.stringify(inspected.data)).toContain('qaHello');
  expect(f.execute).toHaveBeenLastCalledWith('sf_lwc', expect.objectContaining({ component: 'qaHello' }), expect.objectContaining({ workspace: f.child }));
  expect(inspected.execution.runId).toBeTruthy();
  expect(await gateway.execute({ action: 'result.read', runId: inspected.execution.runId }, ctx)).toBeTruthy();
  await expect(gateway.execute({ action: 'result.read', runId: inspected.execution.runId }, { ...ctx, projectId: 'other' })).rejects.toThrow('no longer registered');
  const sdk = f.zcc.services.use<SalesforcePluginSdk>('salesforce');
  for (const file of [`${f.relativeBundle}/qaHello.js`, 'force-app/main/default/lwc/qaHello/qaHello.js']) {
    const result = await sdk.toolInvoke('sf_lwc', { action: 'file.diagnose', file }, ctx) as any;
    expect(result.error, JSON.stringify(result)).toBeUndefined(); expect(result.ok).toBe(true);
    expect(f.execute).toHaveBeenLastCalledWith('sf_lwc', expect.objectContaining({ file: join(f.root, f.relativeBundle, 'qaHello.js') }), expect.objectContaining({ workspace: f.child, allowEffects: false }));
  }
  expect(await gateway.execute({ action: 'call', tool: 'sf_lwc', input: { action: 'file.diagnose', file: '../outside.js' } }, ctx)).toMatchObject({ code: 'toolkit_failed' });
  expect(await gateway.execute({ action: 'call', tool: 'sf_lwc', input: { action: 'project.scan', workspace: f.child } }, ctx)).toMatchObject({ code: 'toolkit_failed', error: expect.stringContaining('owned') });
}, 30000);

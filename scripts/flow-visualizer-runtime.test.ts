import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createFakePluginHost } from '@zana-ai/zcc-plugin-sdk/testing';
import { buildPluginServer } from './plugin-build.js';
import { ACTION_FLOW_XML } from '../src/action-fixtures.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('bundled Flow visualization', () => {
  it('serves the official model from the real server without SDK UI assets or runtime dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sf-packed-flow-')); roots.push(root);
    const runtime = join(root, 'runtime'), project = join(root, 'project');
    await mkdir(runtime); await mkdir(join(project, 'force-app/main/default/flows'), { recursive: true });
    await writeFile(join(project, 'sfdx-project.json'), JSON.stringify({ packageDirectories: [{ path: 'force-app' }] }));
    const flowFile = join(project, 'force-app/main/default/flows/RefreshAcceptance.flow-meta.xml');
    await writeFile(flowFile, ACTION_FLOW_XML);
    await writeFile(join(runtime, 'package.json'), JSON.stringify({ name: '@zcc-ext/salesforce', version: '0.1.5' }));
    // Bundle the actual server entry with the release's production build pipeline.
    await writeFile(join(runtime, 'server.ts'), `export { default } from ${JSON.stringify(fileURLToPath(new URL('../server.ts', import.meta.url)))};`);
    await buildPluginServer(runtime, '2.5.1');
    const packed = join(root, 'packed'); await mkdir(packed);
    await cp(join(runtime, 'server.mjs'), join(packed, 'server.mjs'));
    expect(await readdir(packed)).toEqual(['server.mjs']);
    const plugin = (await import(join(packed, 'server.mjs'))).default;
    const { zcc, harness } = createFakePluginHost({ pluginId: 'salesforce', listProjects: async () => [{ id: 'p', name: 'Disposable', path: project }] });
    try {
      await plugin(zcc);
      const args = { projectId: 'p', target: 'flow://RefreshAcceptance', origin: 'project', visualize: true };
      const first: any = await harness.callRpc('agentActions.source', args);
      expect(first).toMatchObject({ ok: true, data: { status: 'ready', visualization: {
        fileName: 'RefreshAcceptance.flow-meta.xml', data: { label: 'Check return', nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'Eligible', kind: 'decision' }), expect.objectContaining({ id: 'CreateReturn', kind: 'subflow' }),
        ]), edges: expect.arrayContaining([expect.objectContaining({ from: 'FindOrder', to: 'LogError', isFault: true })]),
        variables: expect.arrayContaining([expect.objectContaining({ name: 'orderId', isInput: true })]) },
      } } });
      expect(first.data.visualizationError).toBeUndefined();
      expect(JSON.stringify(first.data.visualization)).not.toContain('platformContext');
      await writeFile(flowFile, ACTION_FLOW_XML.replace('Explain policy', 'REFRESH FLOW UPDATED'));
      const refreshed: any = await harness.callRpc('agentActions.source', args);
      expect(refreshed.data.visualization.data.nodes).toContainEqual(expect.objectContaining({ id: 'Decline', label: 'REFRESH FLOW UPDATED' }));
      expect(refreshed.data.visualizationError).toBeUndefined();
      // The parser receives an authorized snapshot; it cannot change source routing.
      expect(await harness.callRpc('agentActions.source', { ...args, projectId: 'unknown' })).toMatchObject({ ok: false });
      expect(await harness.callRpc('agentActions.source', { ...args, candidate: '../outside.flow-meta.xml' })).toMatchObject({ ok: false });
      await writeFile(flowFile, '<Wrong/>');
      const malformed: any = await harness.callRpc('agentActions.source', args);
      expect(malformed.data.visualization).toBeUndefined();
      expect(malformed.data.visualizationError).toContain('could not parse this Flow');
    } finally { await harness.dispose(); }
  }, 30_000);
});

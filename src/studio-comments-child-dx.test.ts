import { mkdtemp, realpath, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { registerStudioComments } from '../lib/studio-comments.js';
import { STUDIO_RPC } from '../lib/studio-contract.js';
import { createNodeDeps } from '../lib/node-deps.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sf-comments-child-'))); roots.push(root);
  const data = new Map<string, unknown>(), handlers = new Map<string, (args: unknown) => Promise<any>>();
  const deps = createNodeDeps();
  const read = vi.spyOn(deps, 'readFileBounded');
  registerStudioComments({
    zcc: { storage: { kv: { get: async (key: string) => data.get(key), set: async (key: string, value: unknown) => { data.set(key, value); } } }, realtime: { publish: vi.fn() } },
    contexts: { current: () => ({ projectId: 'p', settings: { projectRoot: root } }) }, deps,
    registerRpc: (name: string, handler: (args: unknown) => Promise<any>) => handlers.set(name, handler)
  } as never);
  const save = async (path: string, source: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), source); };
  return { root, read, save, call: (name: string, args: unknown) => handlers.get(name)!(args) };
}

it('derives and reanchors a disk quote for a child-DX draft without editor content', async () => {
  const f = await setup(), path = 'agentforce-drafts/force-app/main/default/aiAuthoringBundles/QA/QA.agent';
  await f.save('agentforce-drafts/sfdx-project.json', '{"packageDirectories":[{"path":"force-app"}]}');
  await f.save(path, '# QA\nconfig:\n    agent_name: "QA"\n');
  const added = await f.call(STUDIO_RPC.commentAdd, { path, line: 3, body: 'Review identity' });
  expect(added).toMatchObject({ ok: true, comment: { quote: '    agent_name: "QA"' } });
  await f.save(path, '# Added line\n# QA\nconfig:\n    agent_name: "QA"\n');
  expect(await f.call(STUDIO_RPC.comments, { path })).toMatchObject({ ok: true, comments: [{ line: 4, endLine: 4, quote: '    agent_name: "QA"' }] });
});

it('preserves normal DX and explicit unsaved-editor content behavior', async () => {
  const f = await setup(); await f.save('sfdx-project.json', '{}'); await f.save('QA.agent', '# saved');
  expect(await f.call(STUDIO_RPC.commentAdd, { path: 'QA.agent', line: 1, body: 'Disk' })).toMatchObject({ comment: { quote: '# saved' } });
  expect(await f.call(STUDIO_RPC.commentAdd, { path: 'QA.agent', line: 1, body: 'Unsaved', content: '# unsaved' })).toMatchObject({ comment: { quote: '# unsaved' } });
});

it('never reads escaped, symlinked outside, missing, or non-agent paths', async () => {
  const f = await setup(), outside = await setup(); await outside.save('Secret.agent', '# outside private source');
  await symlink(join(outside.root, 'Secret.agent'), join(f.root, 'Link.agent'));
  for (const path of [join(outside.root, 'Secret.agent'), '../Secret.agent', 'Link.agent', 'missing.agent', 'sfdx-project.json']) {
    expect(await f.call(STUDIO_RPC.commentAdd, { path, line: 1, body: 'Confinement probe' })).toMatchObject({ ok: true, comment: { quote: '' } });
  }
  expect(f.read.mock.calls.some(([path]) => path.startsWith(outside.root))).toBe(false);
});

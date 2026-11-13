import { mkdtemp, realpath, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createNodeDeps } from '../lib/node-deps.js';
import { findLwcComponent, inspectLwc, normalizeLwcPath, resolveLwcProjectRoot, resolveLwcToolkitProjectRoot, scanLwcComponents } from '../lib/lwc.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sf-lwc-child-'))); roots.push(root);
  const write = async (path: string, text: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); };
  return { root, write, deps: createNodeDeps() };
}

it('selects only the registered DX root or managed Studio child, never arbitrary sibling projects', async () => {
  const f = await setup();
  expect(resolveLwcProjectRoot('', f.deps)).toBeUndefined();
  expect(resolveLwcProjectRoot(join(f.root, 'missing'), f.deps)).toBeUndefined();
  await f.write('one/sfdx-project.json', '{}'); await f.write('two/sfdx-project.json', '{}');
  expect(resolveLwcProjectRoot(f.root, f.deps)).toBeUndefined();
  await f.write('agentforce-drafts/sfdx-project.json', '{}');
  expect(resolveLwcProjectRoot(f.root, f.deps)).toBe(join(f.root, 'agentforce-drafts'));
  await f.write('sfdx-project.json', '{}');
  expect(resolveLwcProjectRoot(f.root, f.deps)).toBe(f.root);
  expect(resolveLwcProjectRoot(join(f.root, 'sfdx-project.json'), f.deps)).toBeUndefined();
});

it('refuses redirected managed children and manifests, including an in-project symlink', async () => {
  for (const internal of [false, true]) {
    const f = await setup(), target = internal ? join(f.root, 'other') : (await setup()).root;
    await mkdir(target, { recursive: true }); await writeFile(join(target, 'sfdx-project.json'), '{}');
    await symlink(target, join(f.root, 'agentforce-drafts'));
    expect(resolveLwcProjectRoot(f.root, f.deps)).toBeUndefined();
  }
  const f = await setup(), outside = await setup(); await outside.write('project.json', '{}');
  await symlink(join(outside.root, 'project.json'), join(f.root, 'sfdx-project.json'));
  expect(resolveLwcProjectRoot(f.root, f.deps)).toBeUndefined();
  const child = await setup(); await child.write('config.json', '{}'); await mkdir(join(child.root, 'agentforce-drafts'));
  await symlink(join(child.root, 'config.json'), join(child.root, 'agentforce-drafts/sfdx-project.json'));
  expect(resolveLwcProjectRoot(child.root, child.deps)).toBeUndefined();
});

it('never lets the toolkit discover ancestor projects or escape through declared packages', async () => {
  const f = await setup(), outside = await setup();
  await f.write('sfdx-project.json', '{"packageDirectories":[{"path":"force-app"}]}');
  await mkdir(join(f.root, 'registered'));
  await expect(resolveLwcToolkitProjectRoot(join(f.root, 'registered'), f.deps)).rejects.toThrow('not configured');
  // Missing package directories remain a valid empty scan; existing ancestors are still confined.
  expect(await resolveLwcToolkitProjectRoot(f.root, f.deps)).toBe(f.root);
  await f.write('sfdx-project.json', JSON.stringify({ packageDirectories: [{ path: outside.root }] }));
  await expect(resolveLwcToolkitProjectRoot(f.root, f.deps)).rejects.toThrow('inside');
  await f.write('sfdx-project.json', '{"packageDirectories":[{"path":"escape/missing"}]}');
  await symlink(outside.root, join(f.root, 'escape'));
  await expect(resolveLwcToolkitProjectRoot(f.root, f.deps)).rejects.toThrow('inside');
});

it('normalizes registered and child relative selections and rejects escapes', () => {
  expect(normalizeLwcPath('/repo', '/repo/agentforce-drafts')).toBeUndefined();
  expect(normalizeLwcPath('/repo', '/repo/agentforce-drafts', 'agentforce-drafts/force-app/main/default/lwc/hello/')).toBe('force-app/main/default/lwc/hello');
  expect(normalizeLwcPath('/repo', '/repo/agentforce-drafts', 'force-app\\main\\default\\lwc\\hello')).toBe('force-app/main/default/lwc/hello');
  for (const path of ['../other/hello', '/other/hello', 'C:\\other\\hello', './hello', 'hello\0', 'hello\n']) expect(() => normalizeLwcPath('/repo', '/repo/agentforce-drafts', path)).toThrow(/inside/);
});

it('never follows package or component sidecar symlinks outside their authorized boundary', async () => {
  const f = await setup(), outside = await setup();
  await f.write('sfdx-project.json', '{"packageDirectories":[{"path":"force-app"},{"path":"escape"}]}');
  await f.write('force-app/main/default/lwc/hello/hello.js-meta.xml', '<xml/>');
  await outside.write('hello.js', '@api secret;'); await outside.write('hello.html', 'private');
  await symlink(outside.root, join(f.root, 'escape'));
  const bundle = join(f.root, 'force-app/main/default/lwc/hello');
  await symlink(join(outside.root, 'hello.js'), join(bundle, 'hello.js')); await symlink(join(outside.root, 'hello.html'), join(bundle, 'hello.html'));
  const read = vi.spyOn(f.deps, 'readFile');
  const components = scanLwcComponents(f.root, f.deps);
  expect(components).toHaveLength(1); expect(components[0]).toMatchObject({ hasJs: false, hasHtml: false });
  expect(inspectLwc(components[0]!, f.deps)).toMatchObject({ publicApi: [], jsChars: 0, htmlChars: 0 });
  expect(read.mock.calls.some(([path]) => path.startsWith(outside.root))).toBe(false);
});

it('requires an exact path to choose duplicate bundle names across packages', async () => {
  const f = await setup(); await f.write('sfdx-project.json', '{"packageDirectories":[{"path":"one"},{"path":"two"}]}');
  for (const pkg of ['one', 'two']) await f.write(`${pkg}/main/default/lwc/hello/hello.js-meta.xml`, '<xml/>');
  const components = scanLwcComponents(f.root, f.deps);
  expect(findLwcComponent(components, 'hello')).toBeNull();
  expect(findLwcComponent(components, 'hello', 'one/main/default/lwc/hello')?.dir).toContain('/one/');
  expect(findLwcComponent(components, undefined, 'two/main/default/lwc/hello/hello')?.dir).toContain('/two/');
  expect(findLwcComponent(components, 'hello', 'unrelated/hello')).toBeNull();
});

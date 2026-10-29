import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPluginApp, buildPluginServer } from './plugin-build.js';
// @ts-expect-error JavaScript release validator intentionally runs without a compiler.
import { checkPackage } from './check-package.mjs';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'salesforce-release-')); roots.push(root);
  const pkg = { name: '@zcc-ext/salesforce', version: '0.1.0', zcc: { server: './server.mjs', app: './app.js', skills: ['skills'], extra: { runtimeAssets: ['playground/dist', 'flow-visualizer', 'toolkit-runtime'] } } };
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  for (const dir of ['skills', 'playground/dist', 'flow-visualizer', 'toolkit-runtime']) await mkdir(join(root, dir), { recursive: true });
  for (const file of ['app.js', 'server.mjs', 'app.meta.json', 'server.meta.json', 'LICENSE', 'flow-visualizer/light.html', 'flow-visualizer/dark.html', 'playground/dist/index.html', 'toolkit-runtime/sdk.mjs']) await writeFile(join(root, file), 'fixture');
  return { root, pkg };
}
describe('standalone release', () => {
  it('bundles host React facades and metadata without a parent checkout', async () => {
    const { root } = await fixture();
    await writeFile(join(root, 'app.tsx'), `import React from 'react'; import {createPortal} from 'react-dom'; import {createRoot} from 'react-dom/client'; import {jsxDEV} from 'react/jsx-dev-runtime'; export const entry = () => [React.version, createPortal, createRoot, jsxDEV, <div>Independent</div>];`);
    await buildPluginApp(root, '2.5.1');
    const code = await readFile(join(root, 'app.js'), 'utf8');
    expect(code).toContain('__ZCC_HOST_REACT__'); expect(code).toContain('__ZCC_HOST_REACT_DOM__'); expect(code).toContain('__ZCC_HOST_REACT_DOM_CLIENT__');
    expect(code).not.toMatch(/from\s*["']react/);
    expect(JSON.parse(await readFile(join(root, 'app.meta.json'), 'utf8'))).toMatchObject({ pluginId: 'salesforce', pluginVersion: '0.1.0', sdkMajor: 1, builtWith: { zccVersion: '2.5.1' } });
  });
  it('bundles server dependencies and writes compatible artifact metadata', async () => {
    const { root } = await fixture();
    await writeFile(join(root, 'dependency.ts'), 'export const value = 42;');
    await writeFile(join(root, 'server.ts'), `import {value} from './dependency'; export default () => value;`);
    await buildPluginServer(root, '2.5.1');
    expect(await readFile(join(root, 'server.mjs'), 'utf8')).not.toContain('./dependency');
    expect((await import(join(root, 'server.mjs'))).default()).toBe(42);
    expect(JSON.parse(await readFile(join(root, 'server.meta.json'), 'utf8'))).toMatchObject({ pluginId: 'salesforce', pluginVersion: '0.1.0', artifactFormatVersion: 1 });
  });
  it('rejects broken sources without writing success metadata', async () => {
    const { root } = await fixture();
    await writeFile(join(root, 'app.tsx'), 'import "./missing";');
    await expect(buildPluginApp(root, '2.5.1')).rejects.toThrow();
  });
  it('accepts a complete runtime', async () => { const { root, pkg } = await fixture(); expect(checkPackage(root)).toEqual(pkg); });
  it.each(['scripts', 'dependencies', 'devDependencies', 'exports'])('rejects install-time %s', async key => {
    const { root, pkg } = await fixture(); await writeFile(join(root, 'package.json'), JSON.stringify({ ...pkg, [key]: {} }));
    expect(() => checkPackage(root)).toThrow(`Unexpected ${key}`);
  });
  it.each(['app.js', 'flow-visualizer/light.html', 'toolkit-runtime/sdk.mjs', 'LICENSE'])('rejects missing %s', async file => {
    const { root } = await fixture(); await rm(join(root, file)); expect(() => checkPackage(root)).toThrow('Missing');
  });
  it.each(['node_modules', '.git', '.env'])('rejects leaked %s', async file => {
    const { root } = await fixture(); await writeFile(join(root, file), 'private'); expect(() => checkPackage(root)).toThrow('Unexpected');
  });
  it('rejects links to files outside the release', async () => {
    const { root } = await fixture(); await symlink(join(root, 'LICENSE'), join(root, 'linked')); expect(() => checkPackage(root)).toThrow('Symlink');
  });
});

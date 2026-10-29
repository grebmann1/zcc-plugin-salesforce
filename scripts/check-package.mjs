import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
export function checkPackage(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@zcc-ext/salesforce');
  assert.equal(pkg.zcc.server, './server.mjs');
  for (const key of ['scripts', 'dependencies', 'devDependencies', 'exports']) assert.equal(pkg[key], undefined, `Unexpected ${key}`);
  for (const path of [pkg.zcc.server, pkg.zcc.app, 'app.meta.json', 'server.meta.json', 'LICENSE', ...pkg.zcc.skills, ...pkg.zcc.extra.runtimeAssets, 'flow-visualizer/light.html', 'flow-visualizer/dark.html', 'playground/dist/index.html', 'toolkit-runtime/sdk.mjs']) assert(existsSync(join(root, path)), `Missing ${path}`);
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      assert(!lstatSync(path).isSymbolicLink(), `Symlink ${path}`);
      assert(!['node_modules', '.git', '.env'].includes(item.name), `Unexpected ${path}`);
      if (item.isDirectory()) walk(path);
    }
  }
  walk(root);
  return pkg;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  checkPackage(fileURLToPath(new URL('../dist/plugin', import.meta.url)));
  console.log('Release package is self-contained and includes all runtime assets');
}

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPluginServer } from './plugin-build.ts';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await buildPluginServer(root, pkg.engines.zcc.replace('>=', ''));
const output = join(root, 'dist/plugin');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['app.js', 'app.meta.json', 'server.mjs', 'server.meta.json', 'skills', 'LICENSE', 'NOTICE', ...pkg.zcc.extra.runtimeAssets]) {
  await cp(join(root, file), join(output, file), { recursive: true });
}
await mkdir(join(output, 'licenses'));
await cp(join(root, 'vendor/AGENTSCRIPT_LICENSE.txt'), join(output, 'licenses/agentscript.txt'));
const { scripts, dependencies, devDependencies, exports, ...runtime } = pkg;
runtime.zcc = { ...pkg.zcc, server: './server.mjs' };
await writeFile(join(output, 'package.json'), JSON.stringify(runtime, null, 2) + '\n');
console.log('Prepared dist/plugin');

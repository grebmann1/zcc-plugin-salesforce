import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const host = process.env.ZCC_HOST_REPO && resolve(process.env.ZCC_HOST_REPO);
if (!host || !existsSync(join(host, 'e2e/fixtures/app.ts'))) throw Error('Set ZCC_HOST_REPO to a Zana checkout for built Electron integration tests.');
if (!existsSync(join(root, 'dist/plugin/package.json'))) throw Error('Run npm run build && npm run package first.');
const staged = mkdtempSync(join(host, 'e2e/external-salesforce-'));
const overlay = join(staged, 'plugins'); mkdirSync(overlay);
try {
  // Install through the real public CLI before exposing the app fixture. Custom
  // integration fixtures may supply a sandbox-specific Salesforce runtime.
  writeFileSync(join(staged, 'app.ts'), `
import { test as base, expect, launchApp } from ${JSON.stringify(join(host, 'e2e/fixtures/app.js'))};
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { prepareReleaseFixture } from ${JSON.stringify(join(root, 'scripts/release-fixture.mjs'))};
const exec = promisify(execFile);
export { expect, launchApp };
export const test = base.extend({ app: async ({ app, home, launchEnv }, use) => {
  const custom = launchEnv.ZCC_BUNDLED_PLUGINS_DIR && join(launchEnv.ZCC_BUNDLED_PLUGINS_DIR, 'salesforce');
  const source = custom && existsSync(custom) ? custom : ${JSON.stringify(join(root, 'dist/plugin'))};
  await prepareReleaseFixture(home, source);
  const result = await exec(process.execPath, [${JSON.stringify(join(host, 'packages/cli/dist/bin/zcc'))}, 'plugin', 'install', 'git:https://github.com/grebmann1/zcc-plugin-salesforce.git@runtime'], {
    cwd: source, timeout: 150000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, HOME: home, ZCC_DATA_DIR: join(home, '.zcc'), ZCC_SERVER_URL: new URL(app.window.url()).origin,
      ZCC_SESSION_ID: undefined, ZCC_SESSION_TOKEN: undefined, ZCC_SKIP_PLUGIN_NPM: '1', npm_config_registry: 'https://registry.npmjs.org/' }
  });
  expect(result.stderr).not.toContain('Error:');
  await use(app);
} });
`);
  for (const dir of readdirSync(join(host, 'plugins'), { withFileTypes: true })) {
    if (dir.isDirectory() && dir.name !== 'salesforce') symlinkSync(join(host, 'plugins', dir.name), join(overlay, dir.name), 'junction');
  }
  symlinkSync(join(root, 'dist/plugin'), join(overlay, 'salesforce'), 'junction');
  for (const name of readdirSync(join(root, 'e2e')).filter(name => name.endsWith('.spec.ts'))) {
    let source = readFileSync(join(root, 'e2e', name), 'utf8');
    source = source.replaceAll("'./fixtures/salesforce-navigation.js'", "'" + join(root, "e2e/fixtures/salesforce-navigation.ts") + "'");
    source = source.replaceAll("'./fixtures/app.js'", "'./app.js'").replaceAll('"./fixtures/app.js"', '"./app.js"');
    source = source.replaceAll("'./fixtures/", "'" + join(host, 'e2e/fixtures/')).replaceAll('"./fixtures/', '"' + join(host, 'e2e/fixtures/'));
    source = source.replaceAll("'./sdk/", "'" + join(host, 'e2e/sdk/')).replaceAll('"./sdk/', '"' + join(host, 'e2e/sdk/'));
    source = source.replaceAll("'../plugins/salesforce/", "'" + root).replaceAll("'../packages/", "'" + join(host, 'packages/'));
    source = source.replaceAll("join(root, 'plugins/salesforce'", "join(" + JSON.stringify(root) + "").replaceAll("join(root, 'plugins/salesforce/package.json')", "join(" + JSON.stringify(root) + ", 'package.json')");
    source = source.replaceAll("join(source, 'plugins/salesforce')", JSON.stringify(root));
    // Fixture servers import plugin modules by subpath, e.g. join(root, 'plugins/salesforce/lib/plugin.ts').
    source = source.replaceAll("join(root, 'plugins/salesforce/", "join(" + JSON.stringify(root) + ", '");
    source = source.replace(/window\.cc\.extensions\.install\(\{\s*kind:\s*['"]bundled['"],\s*id:\s*['"]salesforce['"]\s*\}\)/g, "Promise.resolve({ ok: true })");
    writeFileSync(join(staged, name), source);
  }
  const run = spawnSync('pnpm', ['test:e2e', '--', staged, ...process.argv.slice(2)], { cwd: host, stdio: 'inherit', env: { ...process.env, ZCC_BUNDLED_PLUGINS_DIR: overlay, SALESFORCE_PLUGIN_RUNTIME: join(root, 'dist/plugin') } });
  process.exitCode = run.status ?? 1;
} finally { rmSync(staged, { recursive: true, force: true }); }

import { expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error The standalone Node fixture intentionally needs no compiler.
import { prepareReleaseFixture } from './release-fixture.mjs';
const exec = promisify(execFile);
it('clones the current runtime offline using the public repository identity', async () => {
  const home = await mkdtemp(join(tmpdir(), 'salesforce-git-'));
  try {
    const source = join(home, 'source'); await mkdir(source);
    await writeFile(join(source, 'package.json'), '{"name":"@zcc-ext/salesforce"}');
    await writeFile(join(home, '.gitconfig'), '[user]\n name = Existing\n');
    vi.stubEnv('GIT_DIR', join(home, 'untrusted-inherited-git-dir'));
    await prepareReleaseFixture(home, source);
    const config = await readFile(join(home, '.gitconfig'), 'utf8');
    expect(config).toContain('name = Existing');
    const env = { ...process.env, HOME: home };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    await exec('git', ['clone', '--branch', 'runtime', 'https://github.com/grebmann1/zcc-plugin-salesforce.git', join(home, 'clone')], { env, timeout: 10000 });
    expect(await readFile(join(home, 'clone/package.json'), 'utf8')).toContain('@zcc-ext/salesforce');
  } finally { vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }); }
});

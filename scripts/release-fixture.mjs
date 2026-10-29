import { appendFile, cp, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);

/** An isolated offline Git remote for production-boundary integration tests. */
export async function prepareReleaseFixture(home, source) {
  const repository = join(home, 'salesforce-release');
  await mkdir(repository);
  await cp(source, repository, { recursive: true });
  const env = { ...process.env, HOME: home };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  env.GIT_CONFIG_NOSYSTEM = '1';
  for (const args of [['init', '-b', 'runtime'], ['config', 'user.name', 'Fixture'], ['config', 'user.email', 'fixture@example.invalid'], ['add', '.'], ['commit', '-m', 'Current compiled release']]) {
    await exec('git', args, { cwd: repository, env });
  }
  const config = ['', '[protocol "file"]', '  allow = always', `[url "${pathToFileURL(repository).href}"]`, '  insteadOf = https://github.com/grebmann1/zcc-plugin-salesforce.git', ''].join('\n');
  await appendFile(join(home, '.gitconfig'), config, { mode: 0o600 });
  return repository;
}

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeDeps } from '../lib/node-deps.js';
import {
  AgentFilesError,
  createAgentFile,
  listAgentFiles,
  scanAgentFiles,
  scanAgentFilesAsync,
  readAgentFile,
  sha256Hex,
  writeAgentFile
} from '../lib/agent-files.js';
import type { SalesforceDeps } from '../lib/types.js';
import { AGENT_SOURCE_MAX } from '../lib/studio-contract.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function memFs(files: Record<string, string>, extraDirs: Record<string, string[]> = {}): SalesforceDeps {
  const dirsMap: Record<string, string[]> = { ...extraDirs };
  return {
    execSf: async () => ({ code: 1, stdout: '', stderr: '' }),
    request: async () => ({ status: 500, json: null, text: '' }),
    now: () => 0,
    exists: (path) => path in files || path in dirsMap,
    stat: (path) => (path in dirsMap ? 'dir' : path in files ? 'file' : 'missing'),
    readFile: (path) => files[path] ?? null,
    readdir: (path) => dirsMap[path] ?? [],
    realpath: (path) => path,
    writeFile: (path, content) => {
      files[path] = content;
    },
    spawnContained: async () => ({ code: 0, stdout: '', stderr: '' })
  };
}

describe('agent files confinement', () => {
  it('lists saved drafts in the project root and afscript files alongside DX bundles', () => {
    const deps = memFs({ '/proj/sfdx-project.json': '{"packageDirectories":[{"path":"force-app"}]}', '/proj/New.agent': 'start_agent:', '/proj/force-app/Draft.afscript': 'start_agent:' }, { '/proj': ['sfdx-project.json', 'New.agent', 'force-app'], '/proj/force-app': ['Draft.afscript'] });
    expect(listAgentFiles('/proj', deps).map(row => ({ path: row.path, apiName: row.apiName }))).toEqual([
      { path: 'force-app/Draft.afscript', apiName: 'Draft' }, { path: 'New.agent', apiName: 'New' },
    ]);
    expect(listAgentFiles('/proj', deps, { bundlesOnly: true })).toEqual([]);
  });

  it('lists scanned bundles and refuses path escape', async () => {
    const files = {
      '/proj/sfdx-project.json': '{"packageDirectories":[{"path":"force-app"}]}',
      '/proj/force-app/MyBot.agent': 'config:\n    agent_name: "MyBot"\nstart_agent:\n    reasoning:\n        instructions: "hi"\n'
    };
    const deps = memFs(files, {
      '/proj': ['sfdx-project.json', 'force-app'],
      '/proj/force-app': ['MyBot.agent']
    });
    const listed = listAgentFiles('/proj', deps);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ apiName: 'MyBot', path: 'force-app/MyBot.agent' });
    expect(listAgentFiles('/proj', deps, { bundlesOnly: true })).toEqual(listed);
    expect(await scanAgentFilesAsync('/proj', deps)).toEqual(scanAgentFiles('/proj', deps));
    expect(await scanAgentFilesAsync('/proj', deps, { bundlesOnly: true })).toEqual(scanAgentFiles('/proj', deps, { bundlesOnly: true }));
    await expect(scanAgentFilesAsync('/missing', deps)).rejects.toThrow('DX project root');
    expect(() => readAgentFile('/proj', '/etc/passwd', deps)).toThrow(AgentFilesError);
    expect(() => writeAgentFile('/proj', '../secret.agent', 'x', deps)).toThrow(/path_refused|inside/);
    expect(() => writeAgentFile('/proj', 'force-app/notes.txt', 'x', deps)).toThrow(/path_refused|inside/);
  });

  it('rejects writes without a DX root and sha mismatches', () => {
    const files = {
      '/proj/sfdx-project.json': '{"packageDirectories":[{"path":"force-app"}]}',
      '/proj/force-app/MyBot.agent': 'old'
    };
    const deps = memFs(files, {
      '/proj': ['sfdx-project.json', 'force-app'],
      '/proj/force-app': ['MyBot.agent']
    });
    expect(() => listAgentFiles('', deps)).toThrow(/DX project root/);
    expect(() => readAgentFile('/proj', 'force-app/Missing.agent', deps)).toThrow(/not found/);
    expect(() => writeAgentFile('/proj', 'force-app/MyBot.agent', 1 as unknown as string, deps)).toThrow(
      /string content/
    );
    expect(() => writeAgentFile('/proj', 'force-app/MyBot.agent', 'new', deps, sha256Hex('other'))).toThrow(/changed on disk/);
    const written = writeAgentFile('/proj', 'force-app/MyBot.agent', 'new', deps, sha256Hex('old'));
    expect(written.sha256).toBe(sha256Hex('new'));
    expect(readAgentFile('/proj', 'force-app/MyBot.agent', deps).content).toBe('new');
  });

  it('writes atomically through node deps', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zcc-sf-write-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'force-app'), { recursive: true });
    writeFileSync(join(dir, 'sfdx-project.json'), '{"packageDirectories":[{"path":"force-app"}]}');
    writeFileSync(join(dir, 'force-app', 'Bot.agent'), 'old');
    const deps = createNodeDeps();
    writeAgentFile(dir, 'force-app/Bot.agent', 'saved', deps);
    expect(readFileSync(join(dir, 'force-app', 'Bot.agent'), 'utf8')).toBe('saved');
  });

  it('walks a non-DX folder for .agent files when allowed', () => {
    const files = {
      '/src/bots/QC/QC.agent': 'config:\n    agent_name: "QC"\n',
      '/src/README.md': 'nope'
    };
    const deps = memFs(files, {
      '/src': ['bots', 'README.md'],
      '/src/bots': ['QC'],
      '/src/bots/QC': ['QC.agent']
    });
    expect(() => listAgentFiles('/src', deps)).toThrow(/DX project root/);
    const listed = listAgentFiles('/src', deps, { allowNonDx: true });
    expect(listAgentFiles('/src', deps, { allowNonDx: true, bundlesOnly: true })).toEqual([]);
    expect(listed).toEqual([
      expect.objectContaining({ apiName: 'QC', path: 'bots/QC/QC.agent' })
    ]);
    expect(readAgentFile('/src', 'bots/QC/QC.agent', deps, { allowNonDx: true }).content).toContain('QC');
    expect(() => readAgentFile('/src', '/etc/passwd', deps, { allowNonDx: true })).toThrow(AgentFilesError);
  });
  it('creates a complete private file without overwriting files or following destination symlinks', () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-create-')); dirs.push(root);
    const deps = createNodeDeps();
    const options = { allowNonDx: true };
    const result = createAgentFile(root, 'New.agent', 'new source', deps, options);
    expect(result).toEqual({ path: 'New.agent', sha256: sha256Hex('new source') });
    expect(statSync(join(root, 'New.agent')).mode & 0o777).toBe(0o600);
    expect(() => createAgentFile(root, 'New.agent', 'overwrite', deps, options)).toThrow('already exists');
    symlinkSync(join(root, 'New.agent'), join(root, 'Link.agent'));
    expect(() => createAgentFile(root, 'Link.agent', 'overwrite', deps, options)).toThrow('already exists');
    expect(readFileSync(join(root, 'New.agent'), 'utf8')).toBe('new source');
    expect(readdirSync(root).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('confines new files through an existing parent and bounds source', () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-confine-')); dirs.push(root);
    const outside = mkdtempSync(join(tmpdir(), 'sf-outside-')); dirs.push(outside);
    symlinkSync(outside, join(root, 'escape'));
    const deps = createNodeDeps(); const options = { allowNonDx: true };
    for (const path of ['../Outside.agent', '/tmp/Outside.agent', 'escape/Outside.agent', 'missing/New.agent', 'notes.txt', '']) {
      expect(() => createAgentFile(root, path, 'source', deps, options)).toThrow();
    }
    expect(() => createAgentFile(root, 'New.agent', 'x'.repeat(AGENT_SOURCE_MAX + 1), deps, options)).toThrow('10 MB');
    expect(() => createAgentFile(root, 'New.agent', 'source', { ...deps, createFile: undefined }, options)).toThrow('unavailable');
    expect(() => createAgentFile(root, 'New.agent', 'source', { ...deps, createFile: () => { throw Error('disk full'); } }, options)).toThrow('disk full');
    expect(readdirSync(outside)).toEqual([]);
  });

});

it('finds agents beyond cache files and pins an opened agent beyond the general scan budget', async () => {
  const files = { '/p/force-app/Bot.agent': 'start_agent welcome:', '/p/zzz/Open.agent': 'start_agent welcome:' };
  const deps = memFs(files, { '/p': ['.pnpm-store', 'force-app', 'noise', 'zzz'], '/p/.pnpm-store': Array(5000).fill('cache'), '/p/force-app': ['Bot.agent'], '/p/noise': Array.from({ length: 21000 }, (_, i) => `file${i}`), '/p/zzz': ['Open.agent'] });
  const scan = scanAgentFiles('/p', deps, { allowNonDx: true, priority: ['zzz/Open.agent', '../escape.agent'] });
  expect(scan.truncated).toBe(true);
  expect(scan.files.map(f => f.path)).toEqual(['force-app/Bot.agent', 'zzz/Open.agent']);
  expect(await scanAgentFilesAsync('/p', deps, { allowNonDx: true, priority: ['zzz/Open.agent', '../escape.agent'] })).toEqual(scan);
});

describe('agent inventory canonical identities', () => {
  const source = 'config:\n    developer_name: "Declared_Agent"\n';
  const metadata = (target: string) => `<AiAuthoringBundle xmlns="http://soap.sforce.com/2006/04/metadata"><target>${target}</target></AiAuthoringBundle>`;
  function fixture(xml?: string, content = source) {
    const files: Record<string, string> = { '/proj/sfdx-project.json': '{"packageDirectories":[{"path":"force-app"}]}', '/proj/force-app/Unrelated_42.agent': content };
    if (xml !== undefined) files['/proj/force-app/Unrelated_42.bundle-meta.xml'] = xml;
    return memFs(files, { '/proj': ['sfdx-project.json', 'force-app'], '/proj/force-app': ['Unrelated_42.agent', ...(xml === undefined ? [] : ['Unrelated_42.bundle-meta.xml'])] });
  }
  const item = (deps: SalesforceDeps) => listAgentFiles('/proj', deps)[0]!;

  it('uses a single explicit target in preference to the filename and source declaration across scan modes', async () => {
    const deps = fixture(metadata('Canonical_Agent.v3'));
    expect(item(deps)).toMatchObject({ apiName: 'Unrelated_42', agentApiName: 'Canonical_Agent', versionNumber: 3 });
    expect(listAgentFiles('/proj', deps, { bundlesOnly: true })).toEqual(listAgentFiles('/proj', deps));
    expect(await scanAgentFilesAsync('/proj', deps)).toEqual(scanAgentFiles('/proj', deps));
  });

  it('uses only the parsed developer_name for workspace drafts without inventing a version', () => {
    for (const xml of [undefined, '<AiAuthoringBundle><bundleType>AGENT</bundleType></AiAuthoringBundle>', '<AiAuthoringBundle/>']) {
      expect(item(fixture(xml))).toEqual({ apiName: 'Unrelated_42', path: 'force-app/Unrelated_42.agent', lines: 3, agentApiName: 'Declared_Agent' });
    }
    for (const content of ['start_agent welcome:', 'config:\n    agent_name: "Display_Name"\n', '# config:\n# developer_name: "Comment_Agent"\n', 'start_agent welcome:\n    reasoning:\n        instructions: |\n            config:\n                developer_name: "Text_Agent"\n']) {
      expect(item(fixture(undefined, content))).not.toHaveProperty('agentApiName');
    }
  });

  it('preserves exact developer names and can identify an incomplete draft with errors elsewhere', () => {
    expect(item(fixture(undefined, `${source}start_agent welcome:\n    reasoning:\n        instructions: |\n            Hello\n    nonsense: invalid\n`))).toHaveProperty('agentApiName', 'Declared_Agent');
    expect(item(fixture(undefined, '# @dialect:agentforce\nconfig:\n    developer_name: "Exact_2"\n'))).toHaveProperty('agentApiName', 'Exact_2');
  });

  it('uses the current source content after edits and isolates cached identities from caller mutations', () => {
    const first = item(fixture());
    first.agentApiName = 'Caller_Change';
    expect(item(fixture())).toHaveProperty('agentApiName', 'Declared_Agent');
    expect(item(fixture(undefined, source.replace('Declared_Agent', 'Edited_Agent')))).toHaveProperty('agentApiName', 'Edited_Agent');
    // Populate beyond the bounded cache, then revisit an earlier declaration.
    for (let index = 0; index < 260; index++) expect(item(fixture(undefined, source.replace('Declared_Agent', `Agent_${index}`)))).toHaveProperty('agentApiName', `Agent_${index}`);
    expect(item(fixture())).toHaveProperty('agentApiName', 'Declared_Agent');
  });

  it.each([
    'config:\n    developer_name: "One"\n    developer_name: "Two"\n',
    'config:\n    developer_name: "One"\nconfig:\n    developer_name: "Two"\n',
    'config:\n    developer_name: "One"\n    agent_name: "Two"\n',
    'config:\n    developer_name: Unquoted\n',
    'config:\n    developer_name: "Not an API name"\n',
    'config:\n    developer_name: "{!Dynamic}"\n',
    'config:\n    developer_name: "1Invalid"\n',
    `config:\n    developer_name: "${'A'.repeat(81)}"\n`,
  ])('leaves ambiguous or invalid config identity ungrouped: %s', content => {
    expect(item(fixture(undefined, content))).not.toHaveProperty('agentApiName');
  });

  it.each([
    '<AiAuthoringBundle><target>Canonical.v1</AiAuthoringBundle>',
    '<Other><target>Canonical.v1</target></Other>',
    '<AiAuthoringBundle><target>Canonical.v1</target><target>Canonical.v2</target></AiAuthoringBundle>',
    '<AiAuthoringBundle><target>Canonical.v1</target><target>Canonical.v1</target></AiAuthoringBundle>',
    '<AiAuthoringBundle><target/><other><target>Canonical.v1</target></other></AiAuthoringBundle>',
    '<AiAuthoringBundle><other><target>Canonical.v1</target></other></AiAuthoringBundle>',
    '<AiAuthoringBundle><target attr="x">Canonical.v1</target></AiAuthoringBundle>',
    '<AiAuthoringBundle xmlns:sf="http://soap.sforce.com/2006/04/metadata"><sf:target>Canonical.v1</sf:target></AiAuthoringBundle>',
    '<AiAuthoringBundle><target/></AiAuthoringBundle>',
    metadata('Canonical.v0'), metadata('Canonical.v01'), metadata('Canonical.v-1'),
    metadata('Canonical.v9007199254740992'), metadata('Canonical_1'), metadata('1Invalid.v1'),
    metadata('Canonical.v1.extra'), metadata(`${'A'.repeat(81)}.v1`),
    '<!DOCTYPE AiAuthoringBundle [<!ENTITY target "Canonical.v1">]><AiAuthoringBundle><target>&target;</target></AiAuthoringBundle>',
    '<AiAuthoringBundle><target>Invalid</target><!-- <target>Canonical.v1</target> --></AiAuthoringBundle>',
    '<AiAuthoringBundle/><AiAuthoringBundle><target>Canonical.v1</target></AiAuthoringBundle>',
  ])('keeps invalid or ambiguous metadata ungrouped without masking it with the source: %s', xml => {
    const row = item(fixture(xml));
    expect(row).not.toHaveProperty('agentApiName');
    expect(row).not.toHaveProperty('versionNumber');
  });

  it('reads metadata with the bounded dependency and never falls back to unbounded metadata IO', () => {
    const deps = fixture(metadata('Canonical.v2'));
    const read = deps.readFile;
    deps.readFile = vi.fn(path => path.endsWith('.bundle-meta.xml') ? (() => { throw Error('unbounded metadata read'); })() : read(path));
    deps.readFileBounded = vi.fn((path, maxBytes) => { expect(maxBytes).toBe(64_000); return read(path); });
    expect(item(deps)).toHaveProperty('versionNumber', 2);
    expect(deps.readFileBounded).toHaveBeenCalledOnce();
    expect(deps.readFile).toHaveBeenCalledWith('/proj/force-app/Unrelated_42.agent');
    expect((deps.readFile as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === '/proj/force-app/Unrelated_42.agent')).toHaveLength(1);
    vi.mocked(deps.readFile).mockClear();
    expect(listAgentFiles('/proj', deps, { bundlesOnly: true })[0]).toHaveProperty('versionNumber', 2);
    expect(vi.mocked(deps.readFile).mock.calls.filter(([path]) => path === '/proj/force-app/Unrelated_42.agent')).toHaveLength(1);
  });

  it('bounds legacy metadata IO by UTF-8 bytes and tolerates unreadable or refused metadata', () => {
    const prefix = '<AiAuthoringBundle><target>Canonical.v1</target><!--';
    const suffix = '--></AiAuthoringBundle>';
    const exact = prefix + 'x'.repeat(64_000 - prefix.length - suffix.length) + suffix;
    expect(item(fixture(exact))).toHaveProperty('versionNumber', 1);
    for (const xml of [exact + ' ', prefix + 'é'.repeat(32_000) + suffix]) expect(item(fixture(xml))).not.toHaveProperty('agentApiName');
    for (const read of [() => null, () => { throw Error('too large'); }]) {
      const deps = fixture(metadata('Canonical.v2'));
      deps.readFileBounded = read;
      expect(item(deps)).not.toHaveProperty('agentApiName');
    }
    const deps = fixture(metadata('Canonical.v2'));
    deps.realpath = path => path.endsWith('.bundle-meta.xml') ? '/outside/Secret.bundle-meta.xml' : path;
    expect(item(deps)).not.toHaveProperty('agentApiName');
  });

  it('refuses actual companion symlinks outside the project', () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-inventory-')); dirs.push(root);
    const outside = mkdtempSync(join(tmpdir(), 'sf-inventory-outside-')); dirs.push(outside);
    writeFileSync(join(root, 'Draft_99.agent'), source);
    writeFileSync(join(outside, 'Secret.xml'), metadata('Secret.v9'));
    symlinkSync(join(outside, 'Secret.xml'), join(root, 'Draft_99.bundle-meta.xml'));
    const deps = createNodeDeps();
    const bounded = vi.spyOn(deps, 'readFileBounded');
    expect(listAgentFiles(root, deps, { allowNonDx: true })[0]).not.toHaveProperty('agentApiName');
    expect(bounded).not.toHaveBeenCalled();
  });

  it('applies the same declared identity to afscript drafts and skips oversized source parsing', () => {
    const deps = memFs({ '/proj/Draft.afscript': source, '/proj/Huge.agent': source + 'x'.repeat(AGENT_SOURCE_MAX) }, { '/proj': ['Draft.afscript', 'Huge.agent'] });
    const rows = listAgentFiles('/proj', deps, { allowNonDx: true });
    expect(rows[0]).toMatchObject({ apiName: 'Draft', agentApiName: 'Declared_Agent' });
    expect(rows[1]).not.toHaveProperty('agentApiName');
  });
});

import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from '@sf-agentscript/agentforce';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { isDxProject, scanFilesRecursiveSteps, resolveUnderRoot, runProjectScan, runProjectScanAsync } from './dx-project.js';
import { inspectAgentSource, scanAgentBundlesSteps } from './agent.js';
import { isAgentScriptFile } from './agent-script-model.js';
import type { SalesforceDeps } from './types.js';
import { AGENT_SOURCE_MAX, AGENT_SOURCE_MAX_LABEL } from './studio-contract.js';

export interface AgentFileListItem {
  apiName: string;
  path: string;
  lines: number;
  /** Canonical identity declared by bundle metadata or config.developer_name. */
  agentApiName?: string;
  /** Present only for an explicit, validated Canonical.vN metadata target. */
  versionNumber?: number;
}

type AgentIdentity = Pick<AgentFileListItem, 'agentApiName' | 'versionNumber'>;
const BUNDLE_METADATA_MAX_BYTES = 64_000;
const AGENT_API_NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const bundleMetadataParser = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false, trimValues: true });
const declaredIdentityCache = new Map<string, AgentIdentity>();

/** undefined permits a source declaration; null means metadata is unsafe or ambiguous. */
function bundleIdentity(root: string, path: string, deps: SalesforceDeps): AgentIdentity | null | undefined {
  try {
    const candidate = path.replace(/\.(agent|afscript)$/i, '.bundle-meta.xml');
    if (deps.stat(candidate) === 'missing') return undefined;
    const confined = resolveUnderRoot(root, candidate, deps.realpath);
    if (!confined || deps.stat(confined) !== 'file') return null;
    const metadata = deps.readFileBounded
      ? deps.readFileBounded(confined, BUNDLE_METADATA_MAX_BYTES)
      : deps.readFile(confined);
    if (metadata === null || Buffer.byteLength(metadata, 'utf8') > BUNDLE_METADATA_MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(metadata) || XMLValidator.validate(metadata) !== true) return null;
    const parsed = bundleMetadataParser.parse(metadata) as Record<string, unknown>;
    if (Object.keys(parsed).filter(key => key !== '?xml').join() !== 'AiAuthoringBundle') return null;
    const bundle = parsed.AiAuthoringBundle;
    if (bundle === '') return undefined;
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return null;
    // Count nested and repeated targets too: an unexpected target must not be ignored.
    const pending: unknown[] = [bundle];
    let targetCount = 0;
    while (pending.length) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      for (const [key, value] of Object.entries(node)) {
        if (key.split(':').at(-1) === 'target') targetCount += Array.isArray(value) ? value.length : 1;
        if (typeof value === 'object') pending.push(value);
      }
    }
    if (!targetCount) return undefined;
    const target = (bundle as Record<string, unknown>).target;
    const match = typeof target === 'string' && /^([A-Za-z][A-Za-z0-9_]{0,79})\.v([1-9][0-9]*)$/.exec(target);
    if (targetCount !== 1 || !match || !Number.isSafeInteger(Number(match[2]))) return null;
    return { agentApiName: match[1], versionNumber: Number(match[2]) };
  } catch { return null; }
}

function declaredAgentIdentity(source: string): AgentIdentity {
  if (source.length > AGENT_SOURCE_MAX || !source.includes('developer_name')) return {};
  // Retain only small identities and hashes, never source text or the parser's large AST.
  const key = sha256Hex(source);
  const cached = declaredIdentityCache.get(key);
  if (cached) return cached;
  const identity = parseDeclaredAgentIdentity(source);
  if (declaredIdentityCache.size >= 256) declaredIdentityCache.delete(declaredIdentityCache.keys().next().value!);
  declaredIdentityCache.set(key, identity);
  return identity;
}

function parseDeclaredAgentIdentity(source: string): AgentIdentity {
  try {
    const doc = parse(/@dialect\s*:/.test(source.slice(0, 400)) ? source : `# @dialect:agentforce\n${source}`);
    const config = doc.ast.config;
    const name = config?.developer_name?.value;
    // Duplicate declarations are warnings in the parser, but cannot identify one agent.
    if (doc.diagnostics.some(row => row.code === 'duplicate-key' && /'(config|developer_name)'/.test(row.message))) return {};
    if (config?.agent_name || config?.__diagnostics.some((row: { severity?: number }) => row.severity === 1)) return {};
    return typeof name === 'string' && AGENT_API_NAME.test(name) ? { agentApiName: name } : {};
  } catch { return {}; }
}

function agentIdentity(root: string, path: string, source: string, deps: SalesforceDeps): AgentIdentity {
  const metadata = bundleIdentity(root, path, deps);
  return metadata === undefined ? declaredAgentIdentity(source) : metadata ?? {};
}

export type AgentFilesErrorCode =
  | 'not_configured'
  | 'path_refused'
  | 'not_found'
  | 'invalid_input'
  | 'sha_mismatch'
  | 'write_unavailable';

export interface AgentFilesRootOptions {
  /** When true, the folder need not contain sfdx-project.json. */
  allowNonDx?: boolean;
}

export class AgentFilesError extends Error {
  readonly code: AgentFilesErrorCode;
  constructor(code: AgentFilesErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function toPosixRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}

export function requireDxProjectRoot(projectRoot: string, deps: SalesforceDeps): string {
  const root = projectRoot.trim();
  if (!root || !isDxProject(root, deps.exists)) {
    throw new AgentFilesError('not_configured', 'Set a DX project root that contains sfdx-project.json.');
  }
  return deps.realpath(root);
}

export function requireScanRoot(projectRoot: string, deps: SalesforceDeps): string {
  const root = projectRoot.trim();
  if (!root) {
    throw new AgentFilesError('not_configured', 'Open a project folder that contains Agentforce .agent files.');
  }
  const real = deps.realpath(root);
  if (deps.stat(real) !== 'dir') {
    throw new AgentFilesError('not_found', `Project folder not found: ${projectRoot}`);
  }
  return real;
}

function resolveAgentRoot(projectRoot: string, deps: SalesforceDeps, options?: AgentFilesRootOptions): string {
  return options?.allowNonDx ? requireScanRoot(projectRoot, deps) : requireDxProjectRoot(projectRoot, deps);
}

export function confineAgentPath(projectRoot: string, candidate: string, deps: SalesforceDeps): string {
  const absolute = resolve(projectRoot, candidate.trim());
  const rel = relative(projectRoot, absolute);
  if (rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel) && !candidate.includes('\0') && isAgentScriptFile(absolute) && deps.stat(absolute) === 'missing') {
    let parent = dirname(absolute);
    while (parent !== projectRoot && deps.stat(parent) === 'missing') parent = dirname(parent);
    if (resolveUnderRoot(projectRoot, parent, deps.realpath)) throw new AgentFilesError('not_found', `Agentforce file not found: ${candidate}. Open another file or create a new agent.`);
  }
  const confined = resolveUnderRoot(projectRoot, candidate, deps.realpath);
  if (!confined || !isAgentScriptFile(confined)) {
    throw new AgentFilesError(
      'path_refused',
      'Agentforce path must stay inside the project folder and end in .agent or .afscript.'
    );
  }
  return confined;
}

function* collectAgentFiles(root: string, deps: SalesforceDeps, bundlesOnly = false, priority: readonly string[] = []): Generator<void, { files: AgentFileListItem[]; truncated: boolean }> {
  const scan = bundlesOnly ? { files: [], truncated: false } : yield* scanFilesRecursiveSteps(root, deps, 4000, isAgentScriptFile);
  // The open/created agent must remain discoverable even when the broad walk is incomplete.
  const pinned = priority.slice(0, 21).map(path => resolveUnderRoot(root, path, deps.realpath)).filter((path): path is string => Boolean(path && isAgentScriptFile(path) && deps.stat(path) === 'file'));
  const identities = new Map<string, AgentIdentity>();
  // Editing includes drafts outside a DX package and both supported extensions.
  // Observe the bundle scanner's existing source read instead of reading every file twice.
  const bundleDeps = { ...deps, readFile: (path: string) => {
    const source = deps.readFile(path);
    if (isAgentScriptFile(path)) identities.set(path, agentIdentity(root, path, source ?? '', deps));
    return source;
  } };
  const bundles = bundlesOnly
    ? (isDxProject(root, deps.exists) ? yield* scanAgentBundlesSteps(root, bundleDeps) : [])
    : [];
  if (!bundlesOnly) for (const file of new Set([...pinned, ...scan.files])) {
    yield;
    const source = deps.readFile(file) ?? '';
    bundles.push(inspectAgentSource(file, source));
    identities.set(file, agentIdentity(root, file, source, deps));
  }
  return { truncated: scan.truncated, files: bundles
    .map((row) => ({
      apiName: basename(row.path).replace(/\.(agent|afscript)$/i, ''),
      path: toPosixRelative(root, row.path),
      lines: row.lines,
      ...identities.get(row.path)
    }))
    .sort((a, b) => a.path.localeCompare(b.path)) };
}

export function listAgentFiles(
  projectRoot: string,
  deps: SalesforceDeps,
  options?: AgentFilesRootOptions & { bundlesOnly?: boolean }
): AgentFileListItem[] {
  return scanAgentFiles(projectRoot, deps, options).files;
}

export function scanAgentFiles(projectRoot: string, deps: SalesforceDeps, options?: AgentFilesRootOptions & { bundlesOnly?: boolean; priority?: readonly string[] }) {
  return runProjectScan(scanAgentFilesSteps(projectRoot, deps, options));
}

export function* scanAgentFilesSteps(projectRoot: string, deps: SalesforceDeps, options?: AgentFilesRootOptions & { bundlesOnly?: boolean; priority?: readonly string[] }) {
  return yield* collectAgentFiles(resolveAgentRoot(projectRoot, deps, options), deps, options?.bundlesOnly, options?.priority);
}

export function scanAgentFilesAsync(projectRoot: string, deps: SalesforceDeps, options?: AgentFilesRootOptions & { bundlesOnly?: boolean; priority?: readonly string[] }) {
  return runProjectScanAsync(scanAgentFilesSteps(projectRoot, deps, options));
}

export function readAgentFile(
  projectRoot: string,
  candidate: string,
  deps: SalesforceDeps,
  options?: AgentFilesRootOptions
): { path: string; content: string; sha256: string; apiName: string } {
  const root = resolveAgentRoot(projectRoot, deps, options);
  const absolute = confineAgentPath(root, candidate, deps);
  if (deps.stat(absolute) === 'missing') {
    throw new AgentFilesError('not_found', `Agentforce file not found: ${candidate}`);
  }
  const content = deps.readFile(absolute) ?? '';
  return {
    path: toPosixRelative(root, absolute),
    content,
    sha256: sha256Hex(content),
    apiName: basename(absolute).replace(/\.(agent|afscript)$/i, '')
  };
}

export function writeAgentFile(
  projectRoot: string,
  candidate: string,
  content: string,
  deps: SalesforceDeps,
  expectedSha256?: string,
  options?: AgentFilesRootOptions
): { path: string; sha256: string } {
  if (typeof content !== 'string') {
    throw new AgentFilesError('invalid_input', 'write requires string content.');
  }
  const root = resolveAgentRoot(projectRoot, deps, options);
  const absolute = confineAgentPath(root, candidate, deps);
  const existing = deps.stat(absolute) === 'missing' ? null : (deps.readFile(absolute) ?? '');
  if (expectedSha256) {
    const current = existing === null ? '' : sha256Hex(existing);
    if (current !== expectedSha256) {
      throw new AgentFilesError('sha_mismatch', 'Agentforce file changed on disk. Reload before saving.');
    }
  }
  deps.writeFile(absolute, content);
  return { path: toPosixRelative(root, absolute), sha256: sha256Hex(content) };
}

/** Save as never overwrites. The existing parent must resolve inside the authorized root. */
export function createAgentFile(projectRoot: string, candidate: string, content: string, deps: SalesforceDeps, options?: AgentFilesRootOptions) {
  if (typeof content !== 'string' || content.length > AGENT_SOURCE_MAX) throw new AgentFilesError('invalid_input', `Agent source must be at most ${AGENT_SOURCE_MAX_LABEL}.`);
  const root = resolveAgentRoot(projectRoot, deps, options);
  if (!candidate.trim() || isAbsolute(candidate) || /^[A-Za-z]:/.test(candidate) || candidate.includes('\\') || candidate.includes('\0') || candidate.split('/').includes('..') || !isAgentScriptFile(candidate)) {
    throw new AgentFilesError('path_refused', 'Choose a relative .agent or .afscript path inside this project.');
  }
  const parent = resolveUnderRoot(root, dirname(candidate), deps.realpath);
  if (!parent || deps.stat(parent) !== 'dir') throw new AgentFilesError('path_refused', 'Choose an existing folder inside this project.');
  if (!deps.createFile) throw new AgentFilesError('write_unavailable', 'Creating files is unavailable.');
  const absolute = join(parent, basename(candidate));
  try { deps.createFile(absolute, content); }
  catch (error) {
    if ((error as { code?: string }).code === 'EEXIST') throw new AgentFilesError('invalid_input', 'A file already exists at this path. Choose a different name.');
    throw error;
  }
  return { path: toPosixRelative(root, absolute), sha256: sha256Hex(content) };
}

import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { SalesforceDeps } from './types.js';
import { listFilesRecursive, parsePackageDirectories, resolveUnderRoot } from './dx-project.js';
import { DRAFT_PROJECT } from './agent-drafts.js';
import { confinedToolkitPath } from './toolkit-policy.js';

export type LwcAction = 'scan' | 'inspect' | 'diagnose' | 'test.jest';

export interface LwcInput {
  action?: string;
  component?: string;
  relativePath?: string;
}

export interface LwcComponent {
  name: string;
  dir: string;
  hasHtml: boolean;
  hasJs: boolean;
  hasCss: boolean;
  hasMeta: boolean;
}

const ACTIONS: readonly LwcAction[] = ['scan', 'inspect', 'diagnose', 'test.jest'];

/** Only the registered DX root or Studio's known child project can own LWC execution. */
export function resolveLwcProjectRoot(registeredRoot: string, deps: SalesforceDeps): string | undefined {
  if (!registeredRoot.trim()) return undefined;
  try {
    const root = deps.realpath(registeredRoot);
    if (deps.stat(root) !== 'dir') return undefined;
    const manifest = join(root, 'sfdx-project.json');
    const candidate = deps.exists(manifest) ? root : join(root, DRAFT_PROJECT);
    const confined = resolveUnderRoot(root, candidate, deps.realpath);
    // The managed child and its manifest must not redirect to another project, even inside the registered root.
    if (!confined || confined !== candidate || deps.stat(confined) !== 'dir') return undefined;
    const config = join(confined, 'sfdx-project.json');
    return resolveUnderRoot(confined, config, deps.realpath) === config && deps.stat(config) === 'file' ? confined : undefined;
  } catch { return undefined; }
}

/** The native toolkit searches ancestors and trusts manifest package paths, so validate both before dispatch. */
export async function resolveLwcToolkitProjectRoot(registeredRoot: string, deps: SalesforceDeps): Promise<string> {
  const root = resolveLwcProjectRoot(registeredRoot, deps);
  if (!root) throw Error('LWC project is not configured. Open a DX project or create a Studio draft in its managed agentforce-drafts child project; project folders and manifests cannot redirect through symbolic links.');
  const packages = parsePackageDirectories(deps.readFile(join(root, 'sfdx-project.json')) ?? '{}');
  for (const path of packages) await confinedToolkitPath(root, path);
  return root;
}

/** Accept both registered-project and DX-project relative paths, without basename fallback or traversal. */
export function normalizeLwcPath(registeredRoot: string, projectRoot: string, supplied?: string): string | undefined {
  if (!supplied) return undefined;
  const path = supplied.replace(/\\/g, '/');
  if (/[\0-\x1f]/.test(path) || isAbsolute(path) || /^[a-zA-Z]:/.test(path) || path.split('/').some(part => part === '..' || part === '.')) {
    throw Error('LWC relativePath must stay inside the DX project.');
  }
  const prefix = relative(registeredRoot, projectRoot).split(sep).join('/');
  return (prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path).replace(/\/+$/, '');
}

export function parseLwcInput(input: unknown): { ok: true; action: LwcAction; component?: string; relativePath?: string } | { ok: false; error: string } {
  const raw = input && typeof input === 'object' ? (input as LwcInput) : {};
  const action = typeof raw.action === 'string' ? raw.action.trim() : '';
  if (!ACTIONS.includes(action as LwcAction)) {
    return { ok: false, error: `Unknown sf_lwc action. Use ${ACTIONS.join(', ')}. Deploy/retrieve/create are not offered.` };
  }
  const component = typeof raw.component === 'string' ? raw.component.trim() : '';
  const relativePath = typeof raw.relativePath === 'string' ? raw.relativePath.trim() : '';
  if ((action === 'inspect' || action === 'diagnose' || action === 'test.jest') && !component && !relativePath) {
    return { ok: false, error: `${action} requires component or relativePath.` };
  }
  return {
    ok: true,
    action: action as LwcAction,
    component: component || undefined,
    relativePath: relativePath || undefined
  };
}

export function scanLwcComponents(projectRoot: string, deps: SalesforceDeps): LwcComponent[] {
  const manifest = deps.readFile(join(projectRoot, 'sfdx-project.json')) ?? '{}';
  const packages = parsePackageDirectories(manifest);
  const found: LwcComponent[] = [];
  for (const pkg of packages) {
    const pkgRoot = resolveUnderRoot(projectRoot, pkg, deps.realpath);
    if (!pkgRoot) continue;
    const files = listFilesRecursive(pkgRoot, deps);
    const metaFiles = files.filter(
      (file) => file.endsWith('.js-meta.xml') && (file.includes('/lwc/') || file.includes('\\lwc\\'))
    );
    for (const meta of metaFiles) {
      const dir = meta.slice(0, meta.length - '.js-meta.xml'.length);
      const name = basename(dir);
      found.push({
        name,
        dir,
        hasHtml: containedLwcFile(dir, 'html', deps) !== null,
        hasJs: containedLwcFile(dir, 'js', deps) !== null,
        hasCss: containedLwcFile(dir, 'css', deps) !== null,
        hasMeta: true
      });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function findLwcComponent(
  components: LwcComponent[],
  component?: string,
  relativePath?: string
): LwcComponent | null {
  const normalized = relativePath?.replace(/\\/g, '/');
  const matches = components.filter(row => (!component || row.name === component) && (!normalized ||
    row.dir.replace(/\\/g, '/').endsWith(`/${normalized}`) || dirname(row.dir).replace(/\\/g, '/').endsWith(`/${normalized}`)));
  return (component || relativePath) && matches.length === 1 ? matches[0]! : null;
}

export function diagnoseLwc(component: LwcComponent): string[] {
  const issues: string[] = [];
  if (!/^[a-z][a-zA-Z0-9]*$/.test(component.name)) {
    issues.push('Bundle folder should be camelCase starting with a lowercase letter.');
  }
  if (!component.hasJs) issues.push('Missing .js controller.');
  if (!component.hasHtml) issues.push('Missing .html template.');
  if (!component.hasMeta) issues.push('Missing .js-meta.xml.');
  return issues;
}

export function inspectLwc(component: LwcComponent, deps: SalesforceDeps): Record<string, unknown> {
  const jsPath = containedLwcFile(component.dir, 'js', deps);
  const htmlPath = containedLwcFile(component.dir, 'html', deps);
  const js = jsPath ? deps.readFile(jsPath) ?? '' : '';
  const html = htmlPath ? deps.readFile(htmlPath) ?? '' : '';
  const apis = [...js.matchAll(/@api\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  return {
    name: component.name,
    dir: component.dir,
    files: {
      js: component.hasJs,
      html: component.hasHtml,
      css: component.hasCss,
      meta: component.hasMeta
    },
    publicApi: apis,
    jsChars: js.length,
    htmlChars: html.length
  };
}

/** Inspect sidecars only after resolving each file inside its own bundle; a file symlink must not bypass the scan. */
function containedLwcFile(stem: string, extension: string, deps: SalesforceDeps): string | null {
  const path = resolveUnderRoot(dirname(stem), `${stem}.${extension}`, deps.realpath);
  return path && deps.stat(path) === 'file' ? path : null;
}

export function resolveJestBin(projectRoot: string, deps: SalesforceDeps): string | null {
  const candidates = ['sfdx-lwc-jest', 'lwc-jest'];
  for (const name of candidates) {
    const bin = resolveUnderRoot(projectRoot, join('node_modules', '.bin', name), deps.realpath);
    if (bin && deps.stat(bin) !== 'missing') return bin;
  }
  return null;
}

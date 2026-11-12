import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Shapes } from 'lucide-react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import { cachedRead, readCacheKey, rememberRead } from './read-cache.js';
import { fileRole, highlight, type SourceLang } from './bundle-format.js';
import { sketchLwc } from './lwc-sketch.js';
import { useReferenceRefresh } from './useReferenceRefresh.js';
import { UsedByAgents } from './UsedByAgents.js';
import { STUDIO_RPC, type LwcBundleView as LwcBundleData } from '../../../lib/studio-contract.js';

/** A separate selection token so bundle file paths stay stable across refreshes. */
const SKETCH = -1;

/**
 * Read-only component tab: an LWC a Lightning Type renders or edits with. Shows the agents and types that reach it,
 * then the bundle's top-level files (markup, controller, styles, metadata) and a static sketch of its template.
 * A component outside the project explains itself.
 */
export function LwcBundleView({ pluginId, projectId, componentRef, usedBy, via, onOpenAgent, onOpenType }: {
  pluginId: string;
  projectId?: string;
  componentRef: string;
  usedBy?: string[];
  via?: string[];
  onOpenAgent(path: string): void;
  onOpenType(ref: string): void;
}) {
  const key = readCacheKey(pluginId, projectId, 'lwc', componentRef);
  const root = useRef<HTMLElement>(null);
  const { data, error, busy, refresh } = useReferenceRefresh<LwcBundleData>({
    scope: key, projectId, element: root, initial: cachedRead<LwcBundleData>(key),
    paths: data => data?.path ? [data.path] : [],
    read: async () => {
      const res = await callPluginRpc(pluginId, STUDIO_RPC.lwc, { ...(projectId ? { projectId } : {}), ref: componentRef }) as { ok?: boolean; data?: LwcBundleData; error?: string } | null;
      if (!res?.ok || !res.data) throw Error(res?.error || 'The component could not be read.');
      return res.data;
    },
    remember: data => rememberRead(key, data),
  });
  const [selection, setSelection] = useState<{ scope: string; file?: string | typeof SKETCH }>({ scope: key });

  const name = data?.name || componentRef.split('/').pop() || componentRef;
  const template = data?.files.find(row => !row.truncated && fileRole(row.path, name).label === 'template');
  const style = data?.files.find(row => !row.truncated && fileRole(row.path, name).label === 'styles');
  const sketch = useMemo(() => template ? sketchLwc(template.content, style?.content) : '', [template, style]);
  const selected = selection.scope === key ? selection.file : undefined;
  const file = selected === SKETCH && sketch ? SKETCH : data?.files.find(row => row.path === selected)?.path ?? data?.files[0]?.path;
  const shown = file === SKETCH ? undefined : data?.files.find(row => row.path === file);
  useEffect(() => {
    // A click can commit before this passive fallback effect. Preserve the newer choice.
    setSelection(previous => previous !== selection || previous.scope === key && previous.file === file ? previous : { scope: key, file });
  }, [file, key, selection]);
  const setFile = (file: string | typeof SKETCH) => setSelection({ scope: key, file });
  // Feedback belongs to this exact source; stale effects/completions cannot label another snapshot.
  const copyContext = useMemo(() => ({}), [file, key, shown?.content]);
  const [copiedFor, setCopiedFor] = useState<object | null>(null);
  const copySequence = useRef(0);
  const copied = copiedFor === copyContext;
  const copy = (content: string) => {
    const sequence = ++copySequence.current;
    void Promise.resolve(navigator.clipboard?.writeText(content)).then(() => {
      if (sequence === copySequence.current) setCopiedFor(copyContext);
    }, () => undefined);
  };
  return <section ref={root} className="sf-lt" data-testid="lwc-bundle-view" aria-label={`Component ${componentRef}`}>
    <header className="sf-lt-head">
      <div>
        <h2>{data?.name || componentRef}</h2>
        <div className="sf-lt-meta">
          <code>{componentRef}</code>
          <span className="sf-lt-badge">{data ? data.status === 'missing' ? 'Not in project' : 'Lightning Web Component' : 'Component'}</span>
          {data?.path && <span className="sf-lt-path" title={data.path}>{data.path}</span>}
        </div>
      </div>
      <button type="button" className="sf-atp-btn" disabled={busy} onClick={refresh} aria-label="Refresh component">Refresh</button>
    </header>
    {!data && busy && <p className="sf-lt-note">Loading…</p>}
    {error && <p className="sf-lt-note is-error" role="alert">{error}</p>}
    {data?.message && <p className={`sf-lt-note${data.status === 'ready' ? ' is-warn' : ''}`}>{data.message}</p>}
    {((via && via.length > 0) || (usedBy && usedBy.length > 0)) && <dl className="sf-lt-rel">
      {via && via.length > 0 && <div className="sf-lt-relrow">
        <dt>Renders</dt>
        <dd className="sf-lt-chips">{via.map(ref => <button key={ref} type="button" className="sf-lt-chip" title={ref} onClick={() => onOpenType(ref)}><Shapes size={13} className="is-type" aria-hidden="true" />{ref}</button>)}</dd>
      </div>}
      {usedBy && usedBy.length > 0 && <UsedByAgents usedBy={usedBy} onOpenAgent={onOpenAgent} />}
    </dl>}
    {data && data.files.length > 0 && <div className="sf-lt-bundle">
      <div className="sf-lt-filebar" role="tablist" aria-label="Bundle files">
        {data.files.map(row => {
          const role = fileRole(row.path, name);
          return <button key={row.path} type="button" role="tab" aria-selected={row.path === file} title={row.path} onClick={() => setFile(row.path)}>
            {role.ext && <span className="sf-lt-ext">{role.ext}</span>}{role.label}
          </button>;
        })}
        {sketch && <button type="button" role="tab" aria-selected={file === SKETCH} title="A static sketch of the template and styles" onClick={() => setFile(SKETCH)}>
          <Eye size={12} aria-hidden="true" />Sketch
        </button>}
        <span className="sf-lt-filebar-gap" />
        {shown && !shown.truncated && <button type="button" className="sf-lt-copy" onClick={() => copy(shown.content)}>{copied ? 'Copied' : 'Copy'}</button>}
      </div>
      {file === SKETCH && sketch && <div className="sf-lt-sketch">
        <p className="sf-lt-note">Static sketch: every branch shows once in a labelled box, bindings show as placeholders, and base components and JavaScript do not run.</p>
        <iframe title={`Sketch of ${name}`} sandbox="" srcDoc={sketch} />
      </div>}
      {shown && (shown.truncated
        ? <pre className="sf-lt-source" aria-label={`Source of ${shown.path}`}>This file is larger than 256 KB. Open it in your editor to read it.</pre>
        : <SourceView path={shown.path} content={shown.content} lang={fileRole(shown.path, name).lang} />)}
    </div>}
  </section>;
}

/** Read-only source with line numbers and light colour cues. */
function SourceView({ path, content, lang }: { path: string; content: string; lang: SourceLang }) {
  const tokens = useMemo(() => highlight(content, lang), [content, lang]);
  const lines = useMemo(() => Array.from({ length: content.split('\n').length }, (_, at) => at + 1).join('\n'), [content]);
  return <div className="sf-lt-code">
    <pre className="sf-lt-gutter" aria-hidden="true">{lines}</pre>
    <pre className="sf-lt-source" aria-label={`Source of ${path}`}>{tokens.map((token, at) => token.kind ? <span key={at} className={`tok-${token.kind}`}>{token.text}</span> : token.text)}</pre>
  </div>;
}

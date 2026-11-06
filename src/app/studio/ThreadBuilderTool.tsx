import { useEffect, useRef, useState } from 'react';
import { callPluginRpc, useComposer, useZccContext, useZccNavigate, type PluginThreadPanelProps } from '@zana-ai/zcc-plugin-sdk/app';
import { PopoverPicklist } from '@zana-ai/zcc-ui/popover-picklist';
import type { BuilderTool } from '../../../lib/studio-builder-contract.js';
import { isBuilderTool } from '../../../lib/studio-builder-contract.js';
import { isAgentPanelPath, parseAgentforcePanelFocus } from '../agentforce-panel-params.js';
import { useAgentScriptDoc } from '../agent-doc/useAgentScriptDoc.js';
import { useAgentforceTarget } from '../use-agentforce-target.js';
import { AgentforceLabPanel } from '../AgentforceLabPanel.js';
import { AGENTFORCE_STUDIO_STYLES } from '../agentforce-studio-styles.js';
import { AGENTFORCE_PANEL_STYLES } from '../AgentScriptPanel.js';
import { BuilderTools } from './BuilderTools.js';
import { TestsPane } from './TestsPane.js';
import { BUILDER_STUDIO_STYLES } from './builder-styles.js';
import { useEditorPreferences } from './editor-preferences.js';
import { panelToolActionId } from './studio-tool-bridge.js';
import { routeStudioIntent, type StudioIntent } from './studio-intents.js';
import type { AgentScriptTool } from './studio-tool-catalog.js';

const STYLES = `
.sf-thread-tool { display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; background:var(--sf-surface); color:var(--sf-text); }
.sf-thread-tool-scope { display:flex; align-items:center; gap:8px; padding:8px 16px; border-bottom:1px solid var(--sf-border); flex:none; font-size:12px; }
.sf-thread-tool-scope>span { color:var(--sf-muted); flex:none; }
.sf-thread-tool-scope>button { min-width:0; flex:1; max-width:100%; font:inherit; }
.sf-thread-tool-message { padding:16px; font-size:13px; overflow-wrap:anywhere; }
.sf-thread-tool-message button { font:inherit; color:var(--sf-text); background:var(--sf-surface); border:1px solid var(--sf-border); border-radius:8px; padding:6px 10px; cursor:pointer; }
.sf-thread-tool-brief { display:flex; flex-direction:column; gap:8px; border-bottom:1px solid var(--sf-border); padding:12px 16px; font-size:12px; }
.sf-thread-tool-brief textarea { min-height:100px; resize:vertical; font:inherit; color:var(--sf-text); background:var(--sf-surface); }
`;

/** Thread-owned tools read the shared document; they never acquire its editor lease. */
export function ThreadBuilderTool(props: PluginThreadPanelProps & { tool: BuilderTool }) {
  const context = useZccContext();
  const projectId = props.projectId ?? context.projectId ?? undefined;
  return <ThreadToolWorkspace key={JSON.stringify([props.pluginId, projectId, props.threadId, props.tabId, props.tool])} {...props} projectId={projectId} />;
}

function ThreadToolWorkspace(props: PluginThreadPanelProps & { tool: BuilderTool }) {
  const { pluginId, projectId, threadId, tool } = props;
  const navigate = useZccNavigate();
  const composer = useComposer();
  const focus = parseAgentforcePanelFocus(props.params);
  const rawPath = props.params && typeof props.params === 'object' && !Array.isArray(props.params) ? props.params.path : undefined;
  const invalidPath = rawPath !== undefined && !isAgentPanelPath(focus.path);
  const requestedPath = isAgentPanelPath(focus.path) ? focus.path : null;
  const request = JSON.stringify([rawPath !== undefined, rawPath ?? null, focus.nonce ?? 0]);
  const selectionKey = JSON.stringify([pluginId, projectId, threadId, props.tabId, tool]);
  const { target } = useAgentforceTarget({ pluginId, projectId, threadId, surface: 'playground' });
  const [picked, setPicked] = useState<{ request: string; path: string | null }>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`sf-thread-tool:${selectionKey}`) ?? 'null');
      if (saved?.request === request && (saved.path === null || isAgentPanelPath(saved.path))) return saved;
    } catch { /* Selection recovery is optional. */ }
    return { request, path: requestedPath ?? (!invalidPath && isAgentPanelPath(target?.path) ? target.path : null) };
  });
  // A new explicit link wins immediately; old card params do not undo a later picker choice.
  const path = picked.request === request ? picked.path : requestedPath;
  useEffect(() => {
    if (picked.request !== request) setPicked({ request, path: requestedPath });
  }, [picked.request, request, requestedPath]);
  useEffect(() => {
    try { sessionStorage.setItem(`sf-thread-tool:${selectionKey}`, JSON.stringify({ request, path })); } catch { /* Keep the mounted selection. */ }
  }, [selectionKey, request, path]);
  const [files, setFiles] = useState<Array<{ path: string; label: string }>>([]);
  const [listing, setListing] = useState(false), [listError, setListError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    if (!projectId) return;
    setListing(true); setListError('');
    void callPluginRpc(pluginId, 'agentFiles.list', { projectId, purpose: 'preview' }).then(value => {
      if (!live) return;
      const reply = value as { ok?: boolean; error?: string; files?: Array<{ path: string; label?: string; apiName?: string }> } | null;
      if (!reply?.ok || !Array.isArray(reply.files)) throw Error(reply?.error || 'Could not list project agents.');
      setFiles(reply.files.filter(row => isAgentPanelPath(row.path)).map(row => ({ path: row.path, label: row.label || row.apiName || row.path.split('/').pop()! })));
    }).catch(error => { if (live) setListError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (live) setListing(false); });
    return () => { live = false; };
  }, [pluginId, projectId, refresh]);
  const needsSource = ['compare', 'experiments', 'evals'].includes(tool);
  const api = useAgentScriptDoc(pluginId, projectId ?? null, needsSource || tool === 'issues' ? path : null);
  // Do not pass a previous agent's buffer through the render before the viewer effect opens its next document.
  const doc = api.doc?.path === path && api.doc.projectId === projectId ? api.doc : null;
  const [preferences, onPreferences] = useEditorPreferences(projectId ?? '');
  const [share, setShare] = useState(true);
  const [brief, setBrief] = useState(''), [navigationError, setNavigationError] = useState('');
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  useEffect(() => {
    if (pendingAsk === null) return;
    setPendingAsk(null);
    // The host's fallback composer API is a render-time snapshot. Refresh it in
    // this render before appending, so text typed since the tool last rendered
    // is preserved. Check ownership again before touching the draft.
    if (composer.scope.kind === 'thread' && composer.scope.threadId === threadId) {
      composer.updateText(current => current.trim() ? `${current}\n\n${pendingAsk}` : pendingAsk); composer.focus();
    } else setBrief(pendingAsk);
  }, [pendingAsk, composer, threadId]);
  const root = useRef<HTMLDivElement>(null);
  const intent = (next: StudioIntent) => { void routeStudioIntent({ pluginId, projectId: projectId ?? null, threadId, intent: next, from: root.current, navigate }); };
  const open = (next: AgentScriptTool) => {
    setNavigationError('');
    if (isBuilderTool(next)) {
      if (!navigate.openThreadPanel({ actionId: panelToolActionId(next), title: next === 'artifacts' ? 'Files' : undefined, threadId,
        params: path ? { path } : {} })) setNavigationError('Could not open this tool beside the thread. Try the panel’s New Tab menu.');
      return;
    }
    if (next === 'files' || next === 'agents') { if (path) intent({ kind: 'agent', path }); else setNavigationError('Choose an agent above to open its script.'); }
    else if (next === 'test') open('evals');
    else if (next === 'assistant') composer.focus();
    else if (next === 'preview' || next === 'graph' || next === 'actions' || next === 'comments' || next === 'org-preview') intent({ kind: next, ...(path ? { path } : {}) });
  };
  const ask = (prompt: string) => {
    setPendingAsk(`${prompt}\nProject: ${projectId}\nSource: ${path ?? 'Project workspace'}`);
  };
  const options = [{ value: '', label: 'Project workspace' }, ...files.map(file => ({ value: file.path, label: file.label, description: file.path }))];
  if (path && !files.some(row => row.path === path)) options.push({ value: path, label: path.split('/').pop()! });
  let body;
  if (!projectId) body = <div className="sf-thread-tool-message" role="status">Choose a project for this thread to use Salesforce tools.</div>;
  else if (invalidPath && !path) body = <div className="sf-thread-tool-message" role="alert">This link does not identify a valid Agent Script file. Choose an agent above to continue.</div>;
  else if (needsSource && !path) body = <div className="sf-thread-tool-message" role="status">Choose an agent above to {tool === 'evals' ? 'run evaluations' : 'compare its saved source and draft'}.</div>;
  else if (needsSource && api.error) body = <div className="sf-thread-tool-message" role="alert">{api.error} <button onClick={api.reload}>Try again</button></div>;
  else if (needsSource && !doc) body = <div className="sf-thread-tool-message" role="status">Loading agent source…</div>;
  else if (needsSource && doc?.text === null) body = <div className="sf-thread-tool-message" role="status">This agent is too large to load here. Open its script in Studio.</div>;
  else if (tool === 'evals') body = <TestsPane key={path} workspaceKey={JSON.stringify([selectionKey, path])} title="Evals" pluginId={pluginId} projectId={projectId} threadId={threadId} path={path} source={doc!.text!} dirty={doc!.dirty} visible
    onAskAgent={ask} onShowPath={() => path && intent({ kind: 'graph', path })}
    roleplay={library => <AgentforceLabPanel pluginId={pluginId} projectId={projectId} threadId={threadId} source={doc!.text!} mode="test" fileLabel={path!.split('/').pop()!} agentPath={path!} scenarioLibrary={library} />} />;
  else body = <BuilderTools key={path ?? 'project'} workspaceKey={JSON.stringify([selectionKey, path])} tool={tool} pluginId={pluginId} projectId={projectId} threadId={threadId} path={path}
    source={doc?.text ?? ''} savedSource={doc ? doc.dirty ? doc.savedText : doc.text : null} diagnostics={doc?.diagnostics ?? []} visible
    preferences={preferences} onPreferences={onPreferences} share={share} onShare={setShare} contextSharing={false} onOpenTool={open} onAskAgent={ask}
    onReveal={line => path && intent({ kind: 'agent', path, line })} onReplay={(runId, owner) => intent({ kind: 'preview', path: owner ?? path ?? undefined, runId })} />;
  return <div className="sf-as sf-thread-tool" ref={root} data-testid={`thread-builder-${tool}`}>
    <style>{AGENTFORCE_PANEL_STYLES + AGENTFORCE_STUDIO_STYLES + BUILDER_STUDIO_STYLES + STYLES}</style>
    {projectId && <div className="sf-thread-tool-scope"><span>Agent</span><PopoverPicklist ariaLabel="Tool agent" value={path ?? ''} options={options} disabled={listing} placeholder={listing ? 'Loading agents…' : 'Choose an agent'}
      onChange={value => { setPicked({ request, path: value || null }); setBrief(''); }} /></div>}
    {listError && <div className="sf-thread-tool-message" role="alert">{listError} <button onClick={() => setRefresh(value => value + 1)}>Reload agents</button></div>}
    {tool === 'issues' && path && api.error && <div className="sf-thread-tool-message" role="alert">Agent diagnostics are unavailable: {api.error} <button onClick={api.reload}>Reload diagnostics</button></div>}
    {navigationError && <div className="sf-thread-tool-message" role="alert">{navigationError}</div>}
    {brief && <section className="sf-thread-tool-brief" aria-label="Assistant request"><label>Request for this thread<textarea readOnly value={brief} /></label><button onClick={() => setBrief('')}>Dismiss request</button></section>}
    {body}
  </div>;
}

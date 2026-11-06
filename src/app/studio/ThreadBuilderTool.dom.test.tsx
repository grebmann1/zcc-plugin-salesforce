/** @vitest-environment happy-dom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThreadBuilderTool } from './ThreadBuilderTool.js';
import { studioPanelTool } from './StudioPanelTool.js';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), doc: vi.fn(), target: null as null | { path: string }, projectId: undefined as string | undefined,
 navigate: { openThreadPanel: vi.fn() }, composer: { scope: { kind: 'thread', threadId: 'thread' }, updateText: vi.fn(), focus: vi.fn() }, intent: vi.fn(),
 builder: null as any, tests: null as any, lab: vi.fn(), composerApi: vi.fn() }));
vi.mock('@zana-ai/zcc-plugin-sdk/app', () => ({ callPluginRpc: mock.rpc, useZccContext: () => ({ projectId: mock.projectId }), useComposer: mock.composerApi, useZccNavigate: () => mock.navigate }));
vi.mock('../agent-doc/useAgentScriptDoc.js', () => ({ useAgentScriptDoc: mock.doc }));
vi.mock('../use-agentforce-target.js', () => ({ useAgentforceTarget: () => ({ target: mock.target }) }));
vi.mock('../AgentScriptPanel.js', () => ({ AGENTFORCE_PANEL_STYLES: '' }));
vi.mock('../AgentforceLabPanel.js', () => ({ AgentforceLabPanel: (props: unknown) => { mock.lab(props); return <div>Role-play lab</div>; } }));
vi.mock('./studio-intents.js', () => ({ routeStudioIntent: mock.intent }));
vi.mock('./BuilderTools.js', () => ({ BuilderTools: (props: any) => {
 mock.builder = props; return <div data-testid="builder"><span>{props.tool}</span><button onClick={() => props.onAskAgent('Investigate')}>Investigate</button>
 {['analytics','files','agents','test','assistant','preview','graph','actions','comments','org-preview'].map(tool => <button key={tool} onClick={() => props.onOpenTool(tool)}>{tool}</button>)}
 <button onClick={() => props.onReveal(42)}>Reveal</button><button onClick={() => props.onReplay('run','other.agent')}>Replay</button></div>;
} }));
vi.mock('./TestsPane.js', () => ({ TestsPane: (props: any) => { mock.tests = props; return <div data-testid="evals"><button onClick={() => props.onAskAgent('Fix failing cases')}>Fix cases</button><button onClick={props.onShowPath}>Show path</button>{props.roleplay({ selection: 'scenario' })}</div>; } }));
const initial = { pluginId: 'salesforce', projectId: 'project', threadId: 'thread', tabId: 'tab', params: null, surface: 'thread' as const };
let snapshot: any;
beforeEach(() => {
 mock.composerApi.mockReset().mockImplementation(() => mock.composer);
 sessionStorage.clear(); localStorage.clear(); mock.projectId = undefined; mock.target = null; mock.builder = null; mock.tests = null;
 mock.composer.scope = { kind: 'thread', threadId: 'thread' }; mock.composer.updateText.mockReset(); mock.composer.focus.mockReset(); mock.intent.mockReset();
 mock.navigate.openThreadPanel.mockReset().mockReturnValue(true); mock.lab.mockClear();
 snapshot = { doc: { path: 'a.agent', projectId: 'project', text: 'draft', savedText: 'saved', dirty: true, diagnostics: ['issue'] }, error: null, loading: false, reload: vi.fn() };
 mock.doc.mockReset().mockImplementation(() => snapshot);
 mock.rpc.mockReset().mockResolvedValue({ ok: true, files: [{ path: 'a.agent', apiName: 'Agent A' }, { path: 'b.agent', label: 'Agent B' }, { path: 'c.afscript' }, { path: '../invalid.agent' }] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function choose(name: string) { await waitFor(() => expect((screen.getByRole('button', { name: 'Tool agent' }) as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByRole('button', { name: 'Tool agent' })); fireEvent.click(screen.getByRole('option', { name: new RegExp('^' + name + ' ') })); }
it('runs project tools without Studio, uses the context project, and registers independent thread and agent-session entry points', async () => {
 mock.projectId = 'context-project';
 const Tool = studioPanelTool('settings','Settings');
 const view = render(<Tool {...initial} projectId={undefined} surface="agent-session" />);
 await screen.findByTestId('builder');
 expect(mock.builder).toMatchObject({ projectId: 'context-project', path: null, contextSharing: false });
 expect(mock.rpc).toHaveBeenCalledWith('salesforce','agentFiles.list',{ projectId: 'context-project', purpose: 'preview' });
 view.rerender(<Tool {...initial} surface="plugin-page" />);
 expect(screen.getByText('Settings needs Agent Script Studio')).toBeTruthy();
 expect(screen.queryByTestId('builder')).toBeNull();
});
it('requires an agent for Evals and passes the matching shared draft without taking an editor lease', async () => {
 const view = render(<ThreadBuilderTool {...initial} tool="evals" />);
 expect(screen.getByRole('status').textContent).toContain('Choose an agent');
 await choose('Agent A');
 // The cold thread tool must load the same workbench stylesheet as Studio.
 expect(view.container.querySelector('style')?.textContent).toContain('.af-roleplay-toolbar { display:flex');
 expect(view.container.querySelector('style')?.textContent).toContain('.af-lab-grid { display:flex');
 expect(mock.tests).toMatchObject({ title: 'Evals', projectId: 'project', threadId: 'thread', path: 'a.agent', source: 'draft', dirty: true, visible: true });
 expect(mock.doc).toHaveBeenLastCalledWith('salesforce','project','a.agent');
 expect(mock.lab).toHaveBeenCalledWith(expect.objectContaining({ source: 'draft', mode: 'test', agentPath: 'a.agent', scenarioLibrary: { selection: 'scenario' } }));
 fireEvent.click(screen.getByText('Show path'));
 expect(mock.intent).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread', intent: { kind: 'graph', path: 'a.agent' } }));
 fireEvent.click(screen.getByText('Fix cases'));
 expect(mock.composer.updateText.mock.calls[0][0]('draft question')).toBe('draft question\n\nFix failing cases\nProject: project\nSource: a.agent');
 view.unmount(); render(<ThreadBuilderTool {...initial} tool="evals" />);
 expect(mock.tests.path).toBe('a.agent');
});
it('retains a local selection despite old card params and honors a new explicit request immediately', async () => {
 const view = render(<ThreadBuilderTool {...initial} tool="sessions" params={{ path: 'a.agent' }} />);
 await choose('Agent B'); expect(mock.builder.path).toBe('b.agent'); view.unmount();
 const reopened = render(<ThreadBuilderTool {...initial} tool="sessions" params={{ path: 'a.agent' }} />);
 expect(mock.builder.path).toBe('b.agent');
 reopened.rerender(<ThreadBuilderTool {...initial} tool="sessions" params={{ path: 'a.agent', nonce: 2 }} />);
 expect(mock.builder.path).toBe('a.agent');
 reopened.rerender(<ThreadBuilderTool {...initial} threadId="other-thread" tool="sessions" />);
 expect(mock.builder.path).toBeNull();
});
it('does not substitute another agent for invalid explicit links and allows choosing a valid replacement', async () => {
 mock.target = { path: 'b.agent' };
 const view = render(<ThreadBuilderTool {...initial} tool="compare" params={{ path: '../bad.agent' }} />);
 expect(screen.getByRole('alert').textContent).toContain('valid Agent Script');
 expect(mock.doc).toHaveBeenLastCalledWith('salesforce','project',null);
 await choose('Agent A'); expect(mock.builder.path).toBe('a.agent');
 view.rerender(<ThreadBuilderTool {...initial} tool="compare" params={{ path: null }} />);
 expect(screen.getByRole('alert').textContent).toContain('valid Agent Script');
 view.rerender(<ThreadBuilderTool {...initial} tool="compare" params={{ path: 22 }} />);
 expect(screen.getByRole('alert').textContent).toContain('valid Agent Script');
});
it('waits for the right project document, handles unreadable and oversized sources, and retries', () => {
 const view = render(<ThreadBuilderTool {...initial} tool="compare" params={{ path: 'b.agent' }} />);
 expect(screen.getByRole('status').textContent).toContain('Loading agent');
 snapshot = { ...snapshot, error: 'Cannot read this source' }; view.rerender(<ThreadBuilderTool {...initial} tool="compare" params={{ path: 'b.agent' }} />);
 fireEvent.click(screen.getByText('Try again')); expect(snapshot.reload).toHaveBeenCalledOnce();
 snapshot = { ...snapshot, error: null, doc: { ...snapshot.doc, path: 'b.agent', text: null } };
 view.rerender(<ThreadBuilderTool {...initial} tool="compare" params={{ path: 'b.agent' }} />);
 expect(screen.getByRole('status').textContent).toContain('too large');
 snapshot.doc.text = 'draft B'; snapshot.doc.projectId = 'other-project'; view.rerender(<ThreadBuilderTool {...initial} tool="compare" params={{ path: 'b.agent' }} />);
 expect(screen.queryByTestId('builder')).toBeNull();
 snapshot.doc.projectId = 'project'; snapshot.doc.dirty = false; view.rerender(<ThreadBuilderTool {...initial} tool="compare" params={{ path: 'b.agent' }} />);
 expect(mock.builder).toMatchObject({ source: 'draft B', savedSource: 'draft B' });
});
it('opens tools beside the owning thread, uses existing record routes, and reports refused navigation', async () => {
 render(<ThreadBuilderTool {...initial} tool="issues" params={{ path: 'a.agent' }} />);
 await screen.findByTestId('builder');
 expect(mock.builder.diagnostics).toEqual(['issue']);
 fireEvent.click(screen.getByText('analytics'));
 expect(mock.navigate.openThreadPanel).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'studio-analytics', threadId: 'thread', params: { path: 'a.agent' } }));
 fireEvent.click(screen.getByText('test')); expect(mock.navigate.openThreadPanel).toHaveBeenLastCalledWith(expect.objectContaining({ actionId: 'studio-evals' }));
 for (const tool of ['files','agents','preview','graph','actions','comments','org-preview']) fireEvent.click(screen.getByText(tool));
 expect(mock.intent).toHaveBeenCalledWith(expect.objectContaining({ intent: { kind: 'agent', path: 'a.agent' } }));
 fireEvent.click(screen.getByText('Reveal')); expect(mock.intent).toHaveBeenLastCalledWith(expect.objectContaining({ intent: { kind: 'agent', path: 'a.agent', line: 42 } }));
 fireEvent.click(screen.getByText('Replay')); expect(mock.intent).toHaveBeenLastCalledWith(expect.objectContaining({ intent: { kind: 'preview', path: 'other.agent', runId: 'run' } }));
 fireEvent.click(screen.getByText('assistant')); expect(mock.composer.focus).toHaveBeenCalled();
 mock.navigate.openThreadPanel.mockReturnValue(false); fireEvent.click(screen.getByText('analytics'));
 expect(screen.getByRole('alert').textContent).toContain('Could not open');
});
it('never edits another thread’s draft and offers a copyable request when no matching composer exists', async () => {
 mock.composer.scope.threadId = 'another-thread';
 render(<ThreadBuilderTool {...initial} tool="sessions" />); await screen.findByTestId('builder');
 fireEvent.click(screen.getByText('Investigate')); expect(mock.composer.updateText).not.toHaveBeenCalled();
 expect((screen.getByRole('textbox', { name: 'Request for this thread' }) as HTMLTextAreaElement).value).toContain('Project workspace');
 fireEvent.click(screen.getByText('Dismiss request')); expect(screen.queryByLabelText('Assistant request')).toBeNull();
 fireEvent.click(screen.getByText('files')); expect(screen.getByRole('alert').textContent).toContain('Choose an agent');
});
it('explains a missing project and retries failed agent discovery without breaking project tools', async () => {
 const view = render(<ThreadBuilderTool {...initial} projectId={undefined} tool="settings" />);
 expect(screen.getByRole('status').textContent).toContain('Choose a project'); expect(mock.rpc).not.toHaveBeenCalled();
 mock.rpc.mockResolvedValueOnce({ ok: false, error: 'Discovery failed' });
 view.rerender(<ThreadBuilderTool {...initial} tool="settings" />);
 await screen.findByText('Discovery failed'); fireEvent.click(screen.getByText('Reload agents'));
 await waitFor(() => expect(screen.queryByText('Discovery failed')).toBeNull());
 expect(screen.getByTestId('builder')).toBeTruthy();
});
it('uses a valid shared target when no explicit link exists and tolerates unavailable selection storage', async () => {
 mock.target = { path: 'not-listed.agent' };
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => { throw Error('unavailable'); });
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw Error('unavailable'); });
 render(<ThreadBuilderTool {...initial} tool="sessions" />);
 await screen.findByTestId('builder'); expect(mock.builder.path).toBe('not-listed.agent');
 fireEvent.click(screen.getByRole('button', { name: 'Tool agent' }));
 expect(screen.getByRole('option', { name: 'not-listed.agent' })).toBeTruthy();
});
it('keeps recorded issue evidence usable while explaining unavailable source diagnostics', async () => {
 snapshot.error = 'Source was removed';
 render(<ThreadBuilderTool {...initial} tool="issues" params={{ path: 'a.agent' }} />);
 await screen.findByTestId('builder');
 expect(screen.getByRole('alert').textContent).toContain('Agent diagnostics are unavailable: Source was removed');
 fireEvent.click(screen.getByText('Reload diagnostics')); expect(snapshot.reload).toHaveBeenCalled();
});

it('refreshes the host composer snapshot before appending to text typed after the tool rendered', async () => {
 let text = '';
 mock.composerApi.mockImplementation(() => {
   const captured = text;
   return { ...mock.composer, updateText: (update: (value: string) => string) => { text = update(captured); } };
 });
 render(<ThreadBuilderTool {...initial} tool="sessions" />);
 await waitFor(() => expect((screen.getByRole('button', { name: 'Tool agent' }) as HTMLButtonElement).disabled).toBe(false));
 text = 'Keep the newly typed draft';
 fireEvent.click(screen.getByText('Investigate'));
 expect(text).toBe('Keep the newly typed draft\n\nInvestigate\nProject: project\nSource: Project workspace');
});

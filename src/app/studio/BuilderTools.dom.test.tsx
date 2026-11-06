/** @vitest-environment happy-dom */
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BuilderTools, type BuilderToolsProps } from './BuilderTools.js';
import { StudioToolMenu, StudioToolPicker } from './StudioToolPicker.js';
import { BUILDER_RPC, emptyBuilderResources, parseBuilderResources, type BuilderResources } from '../../../lib/studio-builder-contract.js';
import type { ScenarioSuite } from '../../../lib/studio-contract.js';
import { readEditorPreferences, useEditorPreferences } from './editor-preferences.js';
import { writeComparisonHandle, readComparisonHandle } from './comparison-recovery.js';

const { rpc, comparisonJob } = vi.hoisted(() => ({ rpc: vi.fn(), comparisonJob: vi.fn() }));
let realtime: ((event: unknown) => void) | undefined;
vi.mock('@zana-ai/zcc-plugin-sdk/app', () => ({ callPluginRpc: rpc, useRealtime: (_channel: string, callback: (event: unknown) => void) => { realtime = callback; } }));
vi.mock('./suite-job-rpc.js', () => ({ runSuiteJob: comparisonJob }));
let resources: BuilderResources, suites: ScenarioSuite[], sessions: unknown[];
const comparison = { referenceHash: 'before', candidateHash: 'after', suiteHash: 'suite', at: 10, reference: { a: { outcome: 'fail', reply: 'No', runId: 'r', at: 1 } }, candidate: { a: { outcome: 'pass', reply: 'Within 30 days', runId: 'r2', at: 2 } } };
beforeEach(() => {
  resources = emptyBuilderResources(); sessions = [{ id: 'retained', path: 'a.agent', orgAlias: 'dev', turnCount: 2, createdAt: 1, engine: 'preview', sourceHash: 'source', model: 'model', closed: false, failed: false, execution: { verdict: { outcome: 'pass' } } }];
  suites = [{ id: 'suite', path: 'tests/a.json', cases: [{ id: 'a', name: 'Expired return', utterances: ['Return after 45 days'], expect: {} }, { id: 'b', name: 'Eligible return', utterances: ['Return after 5 days'], expect: {} }], lastResults: { a: { outcome: 'fail', runId: 'case-run', at: 1, reply: 'Create a return', notes: ['Policy was ignored'], conversation: [{ role: 'user', message: 'Return after 45 days' }, { role: 'agent', message: 'Create a return' }] }, b: { outcome: 'pass', runId: 'r2', at: 2, latencyMs: 1000, reply: 'Within 30 days', observed: { topics: ['returns'], actions: ['CheckEligibility'], traced: true } } } }];
  rpc.mockReset().mockImplementation(async (_plugin, method, args) => {
    if (method === BUILDER_RPC.get) return { ok: true, resources };
    if (method === BUILDER_RPC.save) { resources = { ...parseBuilderResources(args.resources), revision: resources.revision + 1 }; return { ok: true, resources }; }
    if (method === 'studio.suites.list') return { ok: true, suites };
    if (method === 'agentLab.list') return { ok: true, data: sessions };
    return { ok: true };
  });
  comparisonJob.mockReset().mockResolvedValue({ ok: true, comparison }); localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function choosePicklist(label: string, option: string) {
  if (label === 'Experiment suite' && !screen.queryByRole('button', { name: label, exact: true })) fireEvent.click(screen.getByText('Comparison setup'));
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
  fireEvent.click(screen.getByRole('option', { name: option, exact: true }));
}
function setup(tool: BuilderToolsProps['tool'], extra: Partial<BuilderToolsProps> = {}) {
  const props: BuilderToolsProps = { tool, pluginId: 'salesforce', projectId: 'p1', threadId: 'thread', path: 'a.agent', source: 'new source', savedSource: 'saved source', diagnostics: [], visible: true, preferences: { lines: true, wrap: false }, onPreferences: vi.fn(), share: false, onShare: vi.fn(), onOpenTool: vi.fn(), onAskAgent: vi.fn(), onReveal: vi.fn(), onReplay: vi.fn(), ...extra };
  const view = render(<BuilderTools {...props} />);
  return { ...view, props, ready: async () => { await waitFor(() => expect(screen.queryByText('Loading project evidence…')).toBeNull()); }, button: (name: string | RegExp) => screen.getByRole('button', { name }) };
}

it.each([
  ['sessions', /Expired return/, 'Expired return', '← All sessions'],
  ['scorers', /^Policy rule /, 'Policy rule', '← All scorers'],
  ['artifacts', /^Review.md /, 'Review.md', '← All files'],
] as const)('moves focus into %s details and back to the originating resource', async (tool, name, heading, back) => {
  resources.scorers = [{ id: 'policy', name: 'Policy rule', kind: 'contains', value: '30 days' }];
  resources.artifacts = [{ id: 'review', name: 'Review.md', content: 'Review findings' }];
  const x = setup(tool); await x.ready();
  const row = x.button(name); row.focus(); fireEvent.click(row);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: heading, level: 2 }));
  const backButton = x.button(back); backButton.focus(); fireEvent.click(backButton);
  expect(document.activeElement).toBe(x.button(name));
});

it.each([
  ['scorers', 'Policy rule', /^Policy rule /, 'Edit scorer', 'Save scorer', 'Name', 'New scorer', 'Delete scorer', 'Search scorers'],
  ['artifacts', 'Review.md', /^Review.md /, 'Edit file', 'Save file', 'File name', 'New file', 'Delete file', 'Search workspace files'],
] as const)('preserves form autofocus and returns focus after %s edits, creation and deletion', async (tool, title, rowName, edit, save, field, create, remove, search) => {
  resources.scorers = [{ id: 'policy', name: 'Policy rule', kind: 'contains', value: '30 days' }];
  resources.artifacts = [{ id: 'review', name: 'Review.md', content: 'Review findings' }];
  const x = setup(tool); await x.ready();
  fireEvent.click(x.button(rowName));
  const editButton = x.button(edit); editButton.focus(); fireEvent.click(editButton);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: field, exact: true })));
  const cancel = x.button('Cancel'); cancel.focus(); fireEvent.click(cancel);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: title, level: 2 })));
  fireEvent.click(x.button(edit));
  x.button(save).focus(); fireEvent.submit(screen.getByRole('textbox', { name: field, exact: true }).closest('form')!);
  await waitFor(() => expect(screen.queryByRole('button', { name: save, exact: true })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: title, level: 2 })));
  const deleteButton = x.button(remove); deleteButton.focus(); fireEvent.click(deleteButton);
  await waitFor(() => expect(screen.queryByRole('button', { name: remove, exact: true })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: search })));
  fireEvent.click(x.button(create));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: field, exact: true })));
  const cancelNew = x.button('Cancel'); cancelNew.focus(); fireEvent.click(cancelNew);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: search })));
  fireEvent.click(x.button(create));
  const name = screen.getByRole('textbox', { name: field, exact: true });
  fireEvent.change(name, { target: { value: 'New resource' } });
  if (tool === 'scorers') fireEvent.change(screen.getByRole('textbox', { name: 'Text to match' }), { target: { value: 'policy' } });
  x.button(save).focus(); fireEvent.submit(name.closest('form')!);
  await waitFor(() => expect(screen.queryByRole('button', { name: save, exact: true })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: search })));
});

it('does not focus a detail workspace belonging to an inactive tool', async () => {
  const x = setup('sessions'); await x.ready();
  x.rerender(<BuilderTools {...x.props} visible={false} />);
  const row = x.button(/Expired return/); row.focus(); fireEvent.click(row);
  expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Expired return', level: 2 }));
});

it('does not take focus from another panel when a file save finishes', async () => {
  resources.artifacts = [{ id: 'review', name: 'Review.md', content: 'Review findings' }];
  const x = setup('artifacts'); await x.ready(); fireEvent.click(x.button(/^Review.md /)); fireEvent.click(x.button('Edit file'));
  let finish!: (value: unknown) => void;
  rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.submit(screen.getByRole('textbox', { name: 'File name' }).closest('form')!);
  const outside = document.createElement('button'); outside.textContent = 'Other panel'; document.body.appendChild(outside); outside.focus();
  try {
    await act(async () => { finish({ ok: true, resources }); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save file' })).toBeNull());
    expect(document.activeElement).toBe(outside);
  } finally { outside.remove(); }
});

it('searches and replays retained and durable saved conversations', async () => {
  sessions.push({ id: 'case-run', engine: 'preview', closed: true });
  const x = setup('sessions'); await x.ready();
  expect(rpc).toHaveBeenCalledWith('salesforce', 'agentLab.list', expect.objectContaining({ projectId: 'p1', path: 'a.agent', summaryOnly: true }));
  fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'Expired' } }); expect(screen.queryByRole('button', { name: /Simulate · retained/ })).toBeNull();
  fireEvent.click(x.button(/Expired return/)); expect(screen.getByText('Return after 45 days')).toBeTruthy(); fireEvent.click(x.button('Open retained runtime trace')); await waitFor(() => expect(x.props.onReplay).toHaveBeenCalledWith('case-run', 'a.agent'));
  fireEvent.click(x.button('← All sessions')); fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: '' } });
  choosePicklist('Session outcome', 'Pass'); expect(screen.queryByRole('button', { name: /Expired return/ })).toBeNull();
  fireEvent.click(x.button(/Simulate · retained/)); fireEvent.click(x.button('Replay conversation')); await waitFor(() => expect(x.props.onReplay).toHaveBeenCalledWith('retained', 'a.agent'));
});
it('keeps durable transcripts readable when their runtime expires, including after listing', async () => {
  const x = setup('sessions'); await x.ready(); fireEvent.click(x.button(/Expired return/));
  expect(screen.getByText(/The runtime trace is no longer retained/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open retained runtime trace' })).toBeNull();
  expect(screen.getByText('Return after 45 days')).toBeTruthy();
  fireEvent.click(x.button('← All sessions')); fireEvent.click(x.button(/Simulate · retained/));
  rpc.mockResolvedValueOnce({ ok: false, error: 'This run has expired. Start a new run.' });
  fireEvent.click(x.button('Replay conversation'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('This run has expired'));
  expect(x.props.onReplay).not.toHaveBeenCalled(); expect(x.button('Replay conversation').hasAttribute('disabled')).toBe(false);
});
it('identifies incomplete saved transcripts instead of presenting them as the complete conversation', async () => {
  suites[0].lastResults!.a.conversationTruncated = true;
  const x = setup('sessions'); await x.ready(); fireEvent.click(x.button(/Expired return/));
  expect(screen.getByText(/This saved conversation is truncated/)).toBeTruthy();
  expect(screen.getByText(/The runtime trace is no longer retained/)).toBeTruthy();
});
it('replays a project-wide session using its owning agent and explains sessions with no file', async () => {
  sessions = [{ id: 'owned', path: 'force-app/Other.agent', engine: 'preview' }, { id: 'orphan', engine: 'preview' }];
  const x = setup('sessions', { path: null }); await x.ready();
  fireEvent.click(x.button(/Simulate · owned/)); fireEvent.click(x.button('Replay conversation'));
  await waitFor(() => expect(x.props.onReplay).toHaveBeenCalledWith('owned', 'force-app/Other.agent'));
  fireEvent.click(x.button('← All sessions')); fireEvent.click(x.button(/Simulate · orphan/)); fireEvent.click(x.button('Replay conversation'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('This run has no agent file'));
  expect(x.props.onReplay).toHaveBeenCalledTimes(1);
});
it('handles saved recordings with no transcript and never invents outcomes', async () => {
  sessions = [{ id: 'closed', orgAlias: 'dev', live: true, closed: true }, { id: 'failed', orgAlias: 'dev', failed: true }, { id: 'open', orgAlias: 'dev' }];
  suites[0].lastResults!.a = { outcome: 'inconclusive', stopped: true, at: 1, runId: '' };
  const x = setup('sessions'); await x.ready(); fireEvent.click(x.button(/Expired return/)); expect(screen.getByText('No transcript was retained for this result.')).toBeTruthy();
  fireEvent.click(x.button('← All sessions')); fireEvent.click(x.button(/closed/)); expect(screen.getByText(/Live · dev/)).toBeTruthy();
});
it('labels summary-only sessions by their actual engine and searches dates, orgs and short ids', async () => {
  const createdAt = new Date('2026-11-02T10:15:00Z').getTime();
  sessions = [
    { id: 'rehearsal-123456789', engine: 'rehearsal', orgAlias: 'sandbox', createdAt, turnCount: 3, closed: true },
    { id: 'live-123456789', engine: 'preview', orgAlias: 'dev', live: true, createdAt, turnCount: 1 },
  ];
  const x = setup('sessions'); await x.ready();
  expect(x.button(/Rehearse · rehearsa/).textContent).toContain('3 turns');
  expect(x.button(/Live · live-123/).textContent).toContain('1 turn');
  const search = screen.getByLabelText('Search sessions');
  for (const value of ['rehearsa', 'sandbox', '2026-11-02', new Date(createdAt).toLocaleString()]) {
    fireEvent.change(search, { target: { value } }); expect(x.button(/Rehearse · rehearsa/)).toBeTruthy();
  }
  fireEvent.change(search, { target: { value: 'no-match' } }); expect(screen.getByText('No conversations match these filters')).toBeTruthy();
  fireEvent.click(x.button('Clear filters')); expect(x.button(/Live · live-123/)).toBeTruthy();
  fireEvent.click(x.button(/Rehearse · rehearsa/)); expect(screen.getByText(/Rehearse · sandbox/)).toBeTruthy();
});
it('computes analytics from recorded cases and exposes empty states', async () => {
  const x = setup('analytics'); await x.ready(); expect(screen.getByText('50%')).toBeTruthy(); expect(screen.getByText('1000 ms')).toBeTruthy(); expect(screen.getByText('CheckEligibility')).toBeTruthy(); expect(screen.getByLabelText('Fail').getAttribute('value')).toBe('1');
  x.unmount(); suites = []; sessions = [];
  const empty = setup('analytics', { path: null }); await empty.ready(); fireEvent.click(empty.button('Open Evals')); expect(empty.props.onOpenTool).toHaveBeenCalledWith('evals');
});
it('investigates actual diagnostic and case failures with context', async () => {
  const x = setup('issues', { diagnostics: [{ line: 22, column: 1, endLine: 22, endColumn: 2, severity: 'warning', message: 'Missing guard' }] }); await x.ready();
  fireEvent.click(x.button('Reveal in Script')); expect(x.props.onReveal).toHaveBeenCalledWith(22);
  fireEvent.click(x.button('Ask Assistant to fix')); expect(x.props.onAskAgent).toHaveBeenCalledWith(expect.stringContaining('Missing guard'));
  fireEvent.click(x.button('Investigate with Assistant')); expect(x.props.onAskAgent).toHaveBeenCalledWith(expect.stringContaining('Policy was ignored'));
  fireEvent.click(x.button('Review Evals')); expect(x.props.onOpenTool).toHaveBeenCalledWith('evals');
});
it('creates deterministic scorers, evaluates evidence, and deletes the project rule', async () => {
  const x = setup('scorers'); await x.ready(); fireEvent.click(x.button('New scorer'));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Return policy' } }); fireEvent.change(screen.getByLabelText('Text to match'), { target: { value: '30 days' } });
  fireEvent.click(x.button('Save scorer')); await screen.findByText('Scorer saved to this project.'); expect(resources.scorers[0].name).toBe('Return policy');
  fireEvent.click(x.button(/Return policy/)); expect(screen.getByText('fail')).toBeTruthy(); expect(screen.getByText('pass')).toBeTruthy();
  fireEvent.click(x.button('Delete scorer')); await screen.findByRole('button', { name: 'New scorer' }); expect(resources.scorers).toEqual([]);
  fireEvent.click(x.button('New scorer')); choosePicklist('Rule', 'Maximum latency (ms)'); fireEvent.change(screen.getByLabelText('Threshold in milliseconds'), { target: { value: '1500' } }); fireEvent.click(x.button('Cancel'));
  fireEvent.click(screen.getAllByRole('button', { name: 'Configure in Evals' })[0]); expect(x.props.onOpenTool).toHaveBeenCalledWith('evals');
});
it('compares current source without modifying the draft', async () => {
  const x = setup('compare'); await x.ready(); expect(screen.getByLabelText('Draft changes').textContent).toContain('+ new source'); fireEvent.click(x.button('Side by side')); expect(screen.getByLabelText('Saved source').textContent).toBe('saved source'); fireEvent.click(x.button('Inline')); fireEvent.click(x.button('Open in Script')); expect(x.props.onReveal).toHaveBeenCalledWith(1); fireEvent.click(x.button('Evaluate both sources')); expect(x.props.onOpenTool).toHaveBeenCalledWith('experiments');
  x.rerender(<BuilderTools {...x.props} source="saved source" />); expect(screen.getByText('No changes between saved source and draft')).toBeTruthy();
  x.rerender(<BuilderTools {...x.props} savedSource={null} />); expect(screen.getByRole('status').textContent).toContain('saved source is unavailable');
});
it('runs the comparison through existing suite jobs, saves its report and detects stale evidence', async () => {
  const x = setup('experiments', { projectId: 'comparison-basic' }); await x.ready(); fireEvent.click(x.button('Run comparison')); await screen.findByText('Comparison complete. Review both responses below.');
  expect(screen.getByText('Comparison setup').closest('details')!.open).toBe(false);
  expect(screen.getByRole('region', { name: 'Saved source versus editor draft' })).toBeTruthy();
  expect(comparisonJob).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ compare: true, source: 'new source', agentPath: 'a.agent', path: 'tests/a.json', startedByUser: true, threadId: 'thread' }), expect.any(AbortSignal), expect.any(Function));
  fireEvent.click(x.button('Save report to Files')); await screen.findByText('Comparison report saved in Files.'); expect(JSON.parse(resources.artifacts[0].content)).toEqual(comparison);
  x.rerender(<BuilderTools {...x.props} source="changed again" />); expect(screen.getByText(/The editor or cases changed/)).toBeTruthy();
  choosePicklist('Experiment suite', 'tests/a.json · 2 cases'); expect(screen.queryByText(/Saved source → Editor draft:/)).toBeNull();
});
it('stops comparisons, reports failures and aborts polling on unmount', async () => {
  let reject!: (error: Error) => void;
  comparisonJob.mockImplementation((_rpc, _args, _signal, onJob) => { onJob('job'); return new Promise((_resolve, no) => { reject = no; }); });
  const x = setup('experiments', { projectId: 'comparison-stop' }); await x.ready(); fireEvent.click(x.button('Run comparison')); fireEvent.click(x.button('Stop comparison')); expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.suites.stop', expect.objectContaining({ jobId: 'job' }));
  await act(async () => reject(Error('Stopped'))); expect(screen.getByRole('alert').textContent).toContain('Stopped');
  comparisonJob.mockResolvedValueOnce({ ok: true }); fireEvent.click(x.button('Run comparison')); await screen.findByText('The comparison returned no valid results.');
  fireEvent.click(x.button('Run comparison')); const signal = comparisonJob.mock.calls.at(-1)![2]; x.unmount(); expect(signal.aborted).toBe(true); await act(async () => reject(Error('Closed')));
});
it('requires explicit per-case setup, resets it when definitions or suites change, and locks it during a run', async () => {
  suites[0].cases[0].prerequisites = ['Prepare account context'];
  suites.push({ id: 'other-suite', path: 'tests/other.json', cases: [{ ...suites[0].cases[0], prerequisites: ['Prepare a different account'] }] });
  const x = setup('experiments', { projectId: 'comparison-setup' }); await x.ready();
  expect((x.button('Run comparison') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Prepare account context')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Prepared: Expired return'));
  expect((x.button('Run comparison') as HTMLButtonElement).disabled).toBe(false);
  choosePicklist('Experiment suite', 'tests/other.json · 1 cases');
  expect((screen.getByLabelText('Prepared: Expired return') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByLabelText('Prepared: Expired return'));
  suites = structuredClone(suites); suites[1].cases[0].utterances = ['A changed case'];
  await act(async () => realtime?.({ projectId: 'comparison-setup', kind: 'suites' })); await x.ready();
  expect((screen.getByLabelText('Prepared: Expired return') as HTMLInputElement).checked).toBe(false);
  expect((x.button('Run comparison') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Prepared: Expired return'));
  let complete!: (reply: unknown) => void;
  comparisonJob.mockImplementation((_rpc, _args, _signal, onJob) => { onJob('setup-job'); return new Promise(resolve => { complete = resolve; }); });
  fireEvent.click(x.button('Run comparison'));
  expect(comparisonJob.mock.calls[0][1]).toMatchObject({ preparedCaseIds: ['a'], path: 'tests/other.json' });
  expect((screen.getByLabelText('Experiment suite') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Prepared: Expired return').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  await act(async () => complete({ ok: true, comparison }));
  expect((screen.getByLabelText('Experiment suite') as HTMLButtonElement).disabled).toBe(false);
});
it('resumes only this agent’s captured comparison handle and retains the completed evidence on reentry', async () => {
  suites[0].cases[0].prerequisites = ['Prepare account context'];
  const real = await vi.importActual<typeof import('./suite-job-rpc.js')>('./suite-job-rpc.js');
  comparisonJob.mockImplementation(real.runSuiteJob);
  const base = rpc.getMockImplementation()!, pending: ((value: unknown) => void)[] = [];
  rpc.mockImplementation((plugin, method, args) => {
    if (method === 'studio.suites.start') return Promise.resolve({ ok: true, jobId: 'owned-job' });
    if (method === 'studio.suites.result') return new Promise(resolve => pending.push(resolve));
    if (method === 'studio.suites.list') return Promise.resolve({ ok: true, suites, job: { jobId: 'unrelated-project-job', status: 'running' } });
    return base(plugin, method, args);
  });
  const x = setup('experiments', { projectId: 'comparison-reentry' }); await x.ready(); fireEvent.click(screen.getByLabelText('Prepared: Expired return')); fireEvent.click(x.button('Run comparison'));
  await screen.findByRole('button', { name: 'Stop comparison' }); await waitFor(() => expect(pending).toHaveLength(1));
  const signal = comparisonJob.mock.calls[0][2]; x.unmount(); expect(signal.aborted).toBe(true);
  const otherAgent = setup('experiments', { projectId: 'comparison-reentry', path: 'other.agent' }); await otherAgent.ready();
  expect(screen.queryByRole('button', { name: 'Stop comparison' })).toBeNull(); expect(comparisonJob).toHaveBeenCalledTimes(1); otherAgent.unmount();
  const returned = setup('experiments', { projectId: 'comparison-reentry' }); await returned.ready();
  await screen.findByRole('button', { name: 'Stop comparison' }); await waitFor(() => expect(pending).toHaveLength(2));
  expect((screen.getByLabelText('Prepared: Expired return') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(returned.button('Stop comparison'));
  expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.suites.stop', { projectId: 'comparison-reentry', jobId: 'owned-job' });
  expect(rpc.mock.calls.filter(([, method]) => method === 'studio.suites.start')).toHaveLength(1);
  await act(async () => { for (const resolve of pending) resolve({ ok: true, status: 'completed', result: { ok: true, comparison } }); });
  await screen.findByText('Comparison complete. Review both responses below.'); returned.unmount();
  const complete = setup('experiments', { projectId: 'comparison-reentry', source: 'edited after comparison' }); await complete.ready();
  expect(screen.getByRole('region', { name: 'Saved source versus editor draft' })).toBeTruthy();
  expect(screen.getByText(/The editor or cases changed/)).toBeTruthy(); expect(comparisonJob).toHaveBeenCalledTimes(2); complete.unmount();
  const otherProject = setup('experiments', { projectId: 'different-project' }); await otherProject.ready();
  expect(screen.queryByRole('region', { name: 'Saved source versus editor draft' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Stop comparison' })).toBeNull();
});
it('reconnects safely when navigation happens before the comparison start response returns', async () => {
  const real = await vi.importActual<typeof import('./suite-job-rpc.js')>('./suite-job-rpc.js'); comparisonJob.mockImplementation(real.runSuiteJob);
  const base = rpc.getMockImplementation()!; let started!: (value: unknown) => void;
  rpc.mockImplementation((plugin, method, args) => {
    if (method === 'studio.suites.start') return new Promise(resolve => { started = resolve; });
    if (method === 'studio.suites.result') return Promise.resolve({ ok: true, status: 'completed', result: { ok: true, comparison } });
    return base(plugin, method, args);
  });
  const x = setup('experiments', { projectId: 'comparison-pending-start' }); await x.ready(); fireEvent.click(x.button('Run comparison')); x.unmount();
  const returned = setup('experiments', { projectId: 'comparison-pending-start' }); await returned.ready();
  expect((returned.button('Comparing…') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => started({ ok: true, jobId: 'late-job' }));
  await screen.findByText('Comparison complete. Review both responses below.');
  expect(rpc.mock.calls.filter(([, method]) => method === 'studio.suites.start')).toHaveLength(1);
  expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.suites.result', { projectId: 'comparison-pending-start', jobId: 'late-job' });
});
it('reports expired owned handles on reentry without adopting an unrelated job or starting over', async () => {
  const real = await vi.importActual<typeof import('./suite-job-rpc.js')>('./suite-job-rpc.js'); comparisonJob.mockImplementation(real.runSuiteJob);
  const base = rpc.getMockImplementation()!; let resolveOriginal!: (value: unknown) => void, polls = 0;
  rpc.mockImplementation((plugin, method, args) => {
    if (method === 'studio.suites.start') return Promise.resolve({ ok: true, jobId: 'expired-job' });
    if (method === 'studio.suites.result') return ++polls === 1 ? new Promise(resolve => { resolveOriginal = resolve; }) : Promise.resolve({ ok: false, error: 'The comparison run expired.' });
    return base(plugin, method, args);
  });
  const x = setup('experiments', { projectId: 'comparison-expired' }); await x.ready(); fireEvent.click(x.button('Run comparison'));
  await screen.findByRole('button', { name: 'Stop comparison' }); x.unmount();
  const returned = setup('experiments', { projectId: 'comparison-expired' }); await returned.ready(); await screen.findByText('The comparison run expired.');
  expect((returned.button('Run comparison') as HTMLButtonElement).disabled).toBe(false);
  expect(rpc.mock.calls.filter(([, method]) => method === 'studio.suites.start')).toHaveLength(1);
  await act(async () => resolveOriginal({ ok: true, status: 'completed', result: { ok: true, comparison } }));
  expect(screen.queryByRole('region', { name: 'Saved source versus editor draft' })).toBeNull();
});
it('rejects malformed comparison evidence rather than rendering broken result controls', async () => {
  comparisonJob.mockResolvedValue({ ok: true, comparison: { reference: { a: null }, candidate: [] } });
  const x = setup('experiments', { projectId: 'comparison-invalid' }); await x.ready(); fireEvent.click(x.button('Run comparison'));
  await screen.findByText('The comparison returned no valid results.');
  expect(screen.queryByRole('region', { name: 'Saved source versus editor draft' })).toBeNull();
});
it('recovers an owned comparison after a reload without submitting source or starting a new job', async () => {
  const scope = JSON.stringify(['salesforce', 'reload-project', 'a.agent']);
  writeComparisonHandle(scope, { jobId: 'reloaded-job', suiteId: 'suite', suitePath: 'tests/a.json', at: Date.now() });
  const real = await vi.importActual<typeof import('./suite-job-rpc.js')>('./suite-job-rpc.js'); comparisonJob.mockImplementation(real.runSuiteJob);
  const base = rpc.getMockImplementation()!;
  rpc.mockImplementation((plugin, method, args) => method === 'studio.suites.result'
    ? Promise.resolve({ ok: true, status: 'completed', result: { ok: true, comparison, suite: suites[0] } }) : base(plugin, method, args));
  const x = setup('experiments', { projectId: 'reload-project' }); await x.ready();
  await screen.findByRole('region', { name: 'Saved source versus editor draft' });
  expect(rpc.mock.calls.some(([, method]) => method === 'studio.suites.start')).toBe(false);
  expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.suites.result', { projectId: 'reload-project', jobId: 'reloaded-job' });
  expect(screen.getByText(/Recovered from an owned job handle/)).toBeTruthy();
  expect(screen.getByText(/The editor or cases changed/)).toBeTruthy();
  expect(localStorage.getItem('salesforce:comparison-handle:v1:' + scope)).not.toContain('new source');
});
it('reports handles lost after a full Studio restart and never reruns the comparison automatically', async () => {
  const scope = JSON.stringify(['salesforce', 'restart-project', 'a.agent']);
  writeComparisonHandle(scope, { jobId: 'lost-on-restart', suiteId: 'suite', suitePath: 'tests/a.json', at: Date.now() });
  const real = await vi.importActual<typeof import('./suite-job-rpc.js')>('./suite-job-rpc.js'); comparisonJob.mockImplementation(real.runSuiteJob);
  const base = rpc.getMockImplementation()!;
  rpc.mockImplementation((plugin, method, args) => method === 'studio.suites.result'
    ? Promise.resolve({ ok: false, error: 'This suite job expired. Check saved suite results before starting another run.' }) : base(plugin, method, args));
  const x = setup('experiments', { projectId: 'restart-project' }); await x.ready(); await screen.findByText(/This suite job expired/);
  expect(readComparisonHandle(scope)).toBeNull();
  expect(rpc.mock.calls.some(([, method]) => method === 'studio.suites.start')).toBe(false);
  expect((x.button('Run comparison') as HTMLButtonElement).disabled).toBe(false);
});
it('shows pinned custom scores in Analytics and separates recorded scorer outcomes from a current rule preview', async () => {
  suites[0].lastResults!.a.scorerEvaluation = { revision: 12, baseOutcome: 'pass', checks: [{ id: 'policy', name: 'Original policy', kind: 'contains', value: '30 days', outcome: 'fail' }] };
  resources.scorers = [{ id: 'policy', name: 'Updated policy', kind: 'contains', value: 'Create' }];
  const x = setup('analytics'); await x.ready();
  expect(screen.getByText('Original policy')).toBeTruthy();
  expect(screen.getByLabelText('Original policy, snapshot 12: 0 pass, 1 fail, 0 inconclusive')).toBeTruthy();
  fireEvent.click(x.button('Open Scorers')); expect(x.props.onOpenTool).toHaveBeenCalledWith('scorers'); x.unmount();
  const scorers = setup('scorers'); await scorers.ready(); fireEvent.click(scorers.button(/Updated policy/));
  const recorded = screen.getByRole('region', { name: 'Recorded scorer results' });
  expect(within(recorded).getByText('Snapshot 12 · contains: 30 days')).toBeTruthy();
  expect(within(recorded).getByText('fail')).toBeTruthy();
  expect(within(recorded).getByText('not recorded')).toBeTruthy();
  fireEvent.click(screen.getByText('Preview current rule on saved responses'));
  const preview = document.querySelector('.sf-builder-score-preview')!;
  expect(within(preview as HTMLElement).getByText('pass')).toBeTruthy();
  expect(suites[0].lastResults!.a.scorerEvaluation.checks[0].outcome).toBe('fail');
});
it('explains comparison cancellation without claiming ordinary evaluation cases were saved', async () => {
  const real = await vi.importActual<typeof import('./suite-job-rpc.js')>('./suite-job-rpc.js'); comparisonJob.mockImplementation(real.runSuiteJob);
  const base = rpc.getMockImplementation()!;
  rpc.mockImplementation((plugin, method, args) => {
    if (method === 'studio.suites.start') return Promise.resolve({ ok: true, jobId: 'stopped-comparison' });
    if (method === 'studio.suites.result') return Promise.resolve({ ok: true, status: 'stopped' });
    return base(plugin, method, args);
  });
  const x = setup('experiments', { projectId: 'comparison-stopped' }); await x.ready(); fireEvent.click(x.button('Run comparison'));
  await screen.findByText('Comparison stopped. Run it again to collect both results.');
  expect(screen.getByRole('alert').textContent).not.toContain('cases were saved');
  expect((x.button('Run comparison') as HTMLButtonElement).disabled).toBe(false);
});
it('labels comparison evidence with the suite definitions actually executed by the server', async () => {
  const executedSuite = structuredClone(suites[0]); executedSuite.cases[0].name = 'Externally updated case';
  comparisonJob.mockResolvedValue({ ok: true, comparison, suite: executedSuite });
  const x = setup('experiments', { projectId: 'comparison-server-definitions' }); await x.ready(); fireEvent.click(x.button('Run comparison'));
  await screen.findByLabelText('Externally updated case: fail → pass');
  expect(screen.getByText(/The editor or cases changed/)).toBeTruthy();
});
it('stores plans and reports as project resources, with preview and assistant discussion', async () => {
  const x = setup('artifacts'); await x.ready(); fireEvent.click(x.button('New file')); fireEvent.change(screen.getByLabelText('Content'), { target: { value: '# Actual plan\n<script>alert(1)</script>' } }); fireEvent.click(x.button('Save file')); await screen.findByText('File saved to this project’s workspace.'); expect(resources.artifacts).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Search workspace files'), { target: { value: 'no-match' } }); expect(screen.queryByRole('button', { name: /Improvement plan/ })).toBeNull(); expect(screen.getByText('No workspace files match “no-match”')).toBeTruthy(); fireEvent.click(x.button('Clear search')); expect(screen.getByLabelText('Search workspace files')).toHaveProperty('value', '');
  fireEvent.click(x.button(/Improvement plan/)); expect(document.querySelector('script')).toBeNull(); fireEvent.click(x.button('Discuss with Assistant')); expect(x.props.onAskAgent).toHaveBeenCalledWith(expect.stringContaining('# Actual plan'));
  fireEvent.click(x.button('Delete file')); await screen.findByText('No workspace files yet');
  fireEvent.click(x.button('Save evaluation report')); await screen.findByText('Evaluation report saved.'); expect(JSON.parse(resources.artifacts[0].content)).toHaveLength(2);
});
it('imports bounded text into an editable draft and rejects oversized files', async () => {
  const x = setup('artifacts'); await x.ready(); const upload = screen.getByLabelText('Import text file');
  fireEvent.change(upload, { target: { files: [{ name: 'large.txt', size: 50001 }] } }); expect(screen.getByRole('alert').textContent).toContain('smaller than 50 KB');
  fireEvent.change(upload, { target: { files: [{ name: 'plan.md', size: 8, text: async () => 'A plan' }] } }); await screen.findByLabelText('Content'); expect((screen.getByLabelText('File name') as HTMLInputElement).value).toBe('plan.md'); fireEvent.click(x.button('Cancel'));
  fireEvent.change(screen.getByLabelText('Import text file'), { target: { files: [{ name: 'bad.md', size: 2, text: async () => { throw Error('Cannot read'); } }] } }); await screen.findByText('Cannot read');
});
it('does not store reports beyond the server limit', async () => {
  suites[0].lastResults!.a.reply = 'x'.repeat(50001); const x = setup('artifacts'); await x.ready(); fireEvent.click(x.button('Save evaluation report')); await screen.findByText('This report exceeds the 50000 character file limit.'); expect(resources.artifacts).toEqual([]);
});

it('applies editor and sharing preferences through the parent callbacks', async () => {
  const x = setup('settings'); await x.ready(); fireEvent.click(screen.getByLabelText('Show line numbers')); expect(x.props.onPreferences).toHaveBeenCalledWith({ lines: false, wrap: false }); fireEvent.click(screen.getByLabelText('Wrap long lines')); expect(x.props.onPreferences).toHaveBeenCalledWith({ lines: true, wrap: true }); fireEvent.click(screen.getByLabelText('Share context with Assistant')); expect(x.props.onShare).toHaveBeenCalledWith(true);
});
it('imports safe tool shortcuts, routes them, and surfaces invalid manifests', async () => {
  const x = setup('import'); await x.ready(); fireEvent.click(x.button('Import tool shortcut')); await screen.findByText('Tool shortcut imported.'); fireEvent.click(x.button('Quality dashboard Review saved evaluation outcomes')); expect(x.props.onOpenTool).toHaveBeenCalledWith('analytics'); fireEvent.click(x.button('Delete Quality dashboard')); await waitFor(() => expect(resources.shortcuts).toEqual([]));
  fireEvent.change(screen.getByLabelText('Tool manifest'), { target: { value: '{"name":"Bad","tool":"https://example.com", "description":""}' } }); fireEvent.click(x.button('Import tool shortcut')); await screen.findByText('Choose a supported tool for this shortcut.');
  fireEvent.change(screen.getByLabelText('Tool manifest'), { target: { value: '{invalid' } }); fireEvent.click(x.button('Import tool shortcut')); await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/JSON|Unexpected|Expected/));
});
it('surfaces loading and write failures, reloads explicitly and ignores late responses after unmount', async () => {
  rpc.mockRejectedValueOnce(Error('Disconnected')); const x = setup('scorers'); await x.ready(); expect(screen.getByRole('alert').textContent).toContain('Disconnected');
  fireEvent.click(x.button('Refresh Scorers')); await x.ready(); expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(x.button('New scorer')); fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test' } }); fireEvent.change(screen.getByLabelText('Text to match'), { target: { value: 'test' } });
  const base = rpc.getMockImplementation()!; rpc.mockImplementation((p, method, args) => method === BUILDER_RPC.save ? Promise.resolve({ ok: false, error: 'Workspace changed in another window' }) : base(p, method, args)); fireEvent.click(x.button('Save scorer')); await screen.findByText('Workspace changed in another window'); expect(screen.getByLabelText('Name')).toBeTruthy();
  x.unmount(); let resolve!: (value: unknown) => void; rpc.mockImplementation(() => new Promise(yes => { resolve = yes; })); const late = setup('analytics'); late.unmount(); await act(async () => resolve({ ok: true }));
});
it('does no reads while hidden and requires a project for resources', async () => {
  const x = setup('issues', { visible: false }); expect(rpc).not.toHaveBeenCalled(); x.unmount();
  const missing = setup('sessions', { projectId: undefined }); await missing.ready(); expect(screen.getByRole('alert').textContent).toContain('Choose a project'); expect(rpc).not.toHaveBeenCalled();
});
it('refreshes matching project evidence and retains caller scope', async () => {
  const x = setup('analytics'); await x.ready(); const before = rpc.mock.calls.length;
  await act(async () => realtime?.({ projectId: 'other', kind: 'suites' })); expect(rpc.mock.calls.length).toBe(before);
  await act(async () => realtime?.({ projectId: 'p1', kind: 'suites' })); await x.ready(); expect(rpc.mock.calls.length).toBeGreaterThan(before);
});
it('searches the full catalog, closes the menu with focus recovery, and excludes Canvas', () => {
  const choose = vi.fn(); const x = render(<StudioToolMenu onSelect={choose} />); const trigger = screen.getByRole('button', { name: 'Add Studio tool' }); fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText('Search Studio tools'), { target: { value: 'Scorers' } }); fireEvent.click(screen.getByRole('button', { name: /Scorers/ })); expect(choose).toHaveBeenCalledWith('scorers'); expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.keyDown(screen.getByLabelText('Search Studio tools'), { key: 'Escape' }); expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger); fireEvent.pointerDown(document.body); expect(trigger.getAttribute('aria-expanded')).toBe('false'); x.unmount();
  render(<StudioToolPicker onSelect={choose} openTools={['preview']} hiddenTools={['agents']} />); expect(screen.queryByRole('button', { name: /^Agents/ })).toBeNull(); expect(screen.getByRole('button', { name: /^Preview/ }).textContent).toContain('Open'); fireEvent.change(screen.getByLabelText('Search Studio tools'), { target: { value: 'Canvas' } }); expect(screen.getByRole('status').textContent).toContain('No tools match');
});
it('persists valid editor preferences and tolerates corrupt or unavailable storage', () => {
  expect(readEditorPreferences('none')).toEqual({ lines: true, wrap: false }); localStorage.setItem('prefs', '{bad'); expect(readEditorPreferences('prefs').lines).toBe(true);
  const { result } = renderHook(() => useEditorPreferences('scope')); act(() => result.current[1]({ lines: false, wrap: true })); expect(readEditorPreferences('salesforce:editor-preferences:scope')).toEqual({ lines: false, wrap: true });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Unavailable'); }); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Unavailable'); }); const fallback = renderHook(() => useEditorPreferences('private')); expect(fallback.result.current[0]).toEqual({ lines: true, wrap: false });
});

it('edits an existing scorer without duplicating it and rescales saved evidence immediately', async () => {
  resources.scorers = [{ id: 'policy', name: 'Return policy', kind: 'contains', value: '30 days' }];
  const x = setup('scorers'); await x.ready();
  fireEvent.change(screen.getByLabelText('Search scorers'), { target: { value: 'nonexistent' } });
  expect(screen.getByText('No scorers match your search')).toBeTruthy(); fireEvent.click(x.button('Clear search'));
  fireEvent.click(x.button(/Return policy/)); fireEvent.click(x.button('Edit scorer'));
  expect(screen.getByRole('heading', { name: 'Edit scorer' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Eligible return response' } });
  choosePicklist('Rule', 'Response excludes');
  expect(screen.getByLabelText('Text to match')).toHaveProperty('value', '');
  fireEvent.change(screen.getByLabelText('Text to match'), { target: { value: 'Create' } });
  fireEvent.submit(screen.getByLabelText('Name').closest('form')!);
  await screen.findByText('Scorer updated. Future runs use this rule; recorded verdicts are unchanged.');
  expect(resources.scorers).toEqual([{ id: 'policy', name: 'Eligible return response', kind: 'excludes', value: 'Create' }]);
  expect(screen.getByText('fail')).toBeTruthy(); expect(screen.getByText('pass')).toBeTruthy();
  fireEvent.click(x.button('Dismiss notification')); expect(screen.queryByText('Scorer updated. Future runs use this rule; recorded verdicts are unchanged.')).toBeNull();
  fireEvent.click(x.button('Edit scorer')); fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard this' } }); fireEvent.click(x.button('Cancel'));
  expect(screen.getByRole('heading', { name: 'Eligible return response' })).toBeTruthy();
});
it('keeps files editable without duplicating them, cancels drafts, and downloads exact text safely', async () => {
  resources.artifacts = [{ id: 'plan', name: '../policy.md', content: '# Initial' }];
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture'), revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const x = setup('artifacts'); await x.ready(); fireEvent.click(x.button(/policy.md/)); fireEvent.click(x.button('Edit file'));
  fireEvent.change(screen.getByLabelText('Content'), { target: { value: '# Updated\nCheck eligibility.' } });
  fireEvent.submit(screen.getByLabelText('File name').closest('form')!);
  await screen.findByText('File updated in this project’s workspace.');
  expect(resources.artifacts).toEqual([{ id: 'plan', name: '../policy.md', content: '# Updated\nCheck eligibility.' }]);
  fireEvent.click(x.button('Download file')); expect(create).toHaveBeenCalled();
  const link = click.mock.instances[0] as HTMLAnchorElement; expect(link.download).toBe('.._policy.md');
  expect(await (create.mock.calls[0][0] as Blob).text()).toBe('# Updated\nCheck eligibility.');
  fireEvent.click(x.button('Edit file')); fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Discard' } }); fireEvent.click(x.button('Cancel'));
  expect(document.querySelector('.sf-builder-file')?.textContent).toBe('# Updated\nCheck eligibility.');
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:fixture'), { timeout: 1500 });
});
it('does not overwrite a resource deleted elsewhere after refreshing an open editor', async () => {
  resources.scorers = [{ id: 'lost', name: 'Removed rule', kind: 'contains', value: 'order' }];
  const x = setup('scorers'); await x.ready(); fireEvent.click(x.button(/Removed rule/)); fireEvent.click(x.button('Edit scorer'));
  resources = { ...resources, scorers: [], revision: 1 };
  await act(async () => realtime?.({ projectId: 'p1', kind: 'builder' })); await x.ready();
  fireEvent.submit(screen.getByLabelText('Name').closest('form')!); await screen.findByText('This scorer was deleted in another window. Cancel to return to the list.');
  expect(rpc.mock.calls.some(row => row[1] === BUILDER_RPC.save)).toBe(false);
  x.unmount(); resources.artifacts = [{ id: 'lost', name: 'Removed file', content: 'Initial' }];
  const f = setup('artifacts'); await f.ready(); fireEvent.click(f.button(/Removed file/)); fireEvent.click(f.button('Edit file'));
  resources = { ...resources, artifacts: [], revision: 2 }; await act(async () => realtime?.({ projectId: 'p1', kind: 'builder' })); await f.ready();
  fireEvent.submit(screen.getByLabelText('File name').closest('form')!); await screen.findByText('This file was deleted in another window. Cancel to return to the list.');
});
it('blocks resource writes until reads succeed, preserves drafts on conflicts, and retries explicitly', async () => {
  const base = rpc.getMockImplementation()!;
  rpc.mockImplementation((p, method, args) => method === BUILDER_RPC.get ? Promise.reject(Error('Resources disconnected')) : base(p, method, args));
  const x = setup('artifacts'); await x.ready(); expect((x.button('New file') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Import text file') as HTMLInputElement).disabled).toBe(true);
  rpc.mockImplementation(base); fireEvent.click(x.button('Try again')); await x.ready();
  fireEvent.click(x.button('New file')); fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Preserve this draft' } });
  rpc.mockImplementation((p, method, args) => method === BUILDER_RPC.save ? Promise.resolve({ ok: false, error: 'Revision conflict' }) : base(p, method, args));
  fireEvent.submit(screen.getByLabelText('File name').closest('form')!); await screen.findByText('Revision conflict');
  expect(screen.getByLabelText('Content')).toHaveProperty('value', 'Preserve this draft');
  rpc.mockImplementation(base); fireEvent.click(x.button('Try again')); await x.ready(); fireEvent.submit(screen.getByLabelText('File name').closest('form')!);
  await screen.findByText('File saved to this project’s workspace.'); expect(resources.artifacts[0].content).toBe('Preserve this draft');
});
it('locks resource controls during saves and ignores concurrent refreshes', async () => {
  resources.scorers = [{ id: 'rule', name: 'Rule', kind: 'contains', value: 'order' }];
  const base = rpc.getMockImplementation()!; let finish!: (reply: unknown) => void;
  rpc.mockImplementation((p, method, args) => method === BUILDER_RPC.save ? new Promise(resolve => { finish = resolve; }) : base(p, method, args));
  const x = setup('scorers'); await x.ready(); fireEvent.click(x.button(/Rule Response contains/)); fireEvent.click(x.button('Edit scorer'));
  fireEvent.submit(screen.getByLabelText('Name').closest('form')!);
  expect((x.button('Save scorer') as HTMLButtonElement).disabled).toBe(true); expect((x.button('Cancel') as HTMLButtonElement).disabled).toBe(true);
  expect((x.button('Refresh Scorers') as HTMLButtonElement).disabled).toBe(true); expect((screen.getByLabelText('Name') as HTMLInputElement).disabled || screen.getByLabelText('Name').closest('fieldset')?.disabled).toBe(true);
  const calls = rpc.mock.calls.length; await act(async () => realtime?.({ projectId: 'p1', kind: 'builder' })); expect(rpc.mock.calls.length).toBe(calls);
  await act(async () => finish({ ok: true, resources: { ...resources, revision: 1 } })); await screen.findByText('Scorer updated. Future runs use this rule; recorded verdicts are unchanged.');
});
it('keeps local tools usable offline and avoids unrelated runtime reads in project tools', async () => {
  const x = setup('settings', { projectId: undefined }); await x.ready(); expect(rpc).not.toHaveBeenCalled();
  x.unmount(); const c = setup('compare'); await c.ready(); expect(rpc).not.toHaveBeenCalled(); c.unmount();
  const imported = setup('import'); await imported.ready(); expect(rpc.mock.calls.map(row => row[1])).toEqual([BUILDER_RPC.get]); imported.unmount(); rpc.mockClear();
  const analytics = setup('analytics'); await analytics.ready(); expect(rpc.mock.calls.map(row => row[1])).toEqual(['studio.suites.list']);
});
it('filters actual issue evidence by source and text with recovery from no results', async () => {
  const x = setup('issues', { diagnostics: [{ severity: 'error', message: 'Unknown topic', line: 4, column: 1, endLine: 4, endColumn: 2 }] }); await x.ready();
  expect(screen.getByText('2 issues')).toBeTruthy(); choosePicklist('Issue source', 'Editor diagnostics');
  expect(screen.queryByText('Expired return')).toBeNull(); fireEvent.change(screen.getByLabelText('Search issues'), { target: { value: 'no-match' } });
  expect(screen.getByText('No issues match these filters')).toBeTruthy(); fireEvent.click(x.button('Clear filters'));
  choosePicklist('Issue source', 'Evaluation failures'); expect(screen.queryByText('Unknown topic')).toBeNull(); expect(screen.getByText('Expired return')).toBeTruthy();
});
it('filters analytics by recorded timestamps, labels absent traces and navigates to actual tools', async () => {
  suites[0].lastResults!.a.at = Date.now();
  const x = setup('analytics'); await x.ready(); choosePicklist('Analytics range', 'Last 7 days');
  expect(screen.getByText('0%')).toBeTruthy(); expect(screen.getByText('No action traces were recorded in these results.')).toBeTruthy();
  fireEvent.click(x.button('Inspect actions')); expect(x.props.onOpenTool).toHaveBeenCalledWith('actions');
  suites[0].lastResults!.a.at = 1; await act(async () => realtime?.({ projectId: 'p1', kind: 'suites' })); await x.ready();
  expect(screen.getByText('No evaluation results in this range')).toBeTruthy(); fireEvent.click(x.button('Show all recorded results')); expect(screen.getByText('50%')).toBeTruthy();
});

it('opens the file explorer when compare has no source and does not invent a diff', async () => {
  const x = setup('compare', { path: null }); await x.ready(); fireEvent.click(x.button('Open an agent')); expect(x.props.onOpenTool).toHaveBeenCalledWith('files'); expect(screen.queryByLabelText('Draft changes')).toBeNull();
});

it('uses a themed portal picklist with keyboard selection, Escape focus and outside dismissal', async () => {
  const x = setup('sessions'); await x.ready();
  expect(x.container.querySelector('select')).toBeNull();
  const trigger = x.button('Session outcome');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const menu = screen.getByRole('listbox', { name: 'Session outcome' });
  expect(x.container.contains(menu)).toBe(false);
  expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
  expect(screen.getByRole('option', { name: 'All outcomes' }).getAttribute('aria-selected')).toBe('true');
  expect(within(menu).queryByRole('textbox')).toBeNull();
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  fireEvent.keyDown(menu, { key: 'Enter' });
  expect(trigger.textContent).toBe('Fail');
  expect(screen.queryByRole('button', { name: /Eligible return/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Expired return/ })).toBeTruthy();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  expect(screen.getByRole('option', { name: 'Fail' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.mouseDown(screen.getByLabelText('Search sessions'));
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(x.button('Reset filters')); expect(trigger.textContent).toBe('All outcomes');
});

it('changes scorer rules without submitting, clears incompatible values and disables the picker while saving', async () => {
  const x = setup('scorers'); await x.ready(); fireEvent.click(x.button('New scorer'));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Response speed' } });
  fireEvent.change(screen.getByLabelText('Text to match'), { target: { value: 'old text' } });
  choosePicklist('Rule', 'Maximum latency (ms)');
  expect((screen.getByLabelText('Threshold in milliseconds') as HTMLInputElement).value).toBe('');
  expect(rpc.mock.calls.some(([, method]) => method === BUILDER_RPC.save)).toBe(false);
  fireEvent.change(screen.getByLabelText('Threshold in milliseconds'), { target: { value: '1200' } });
  let finish!: (value: unknown) => void;
  rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(x.button('Save scorer'));
  expect((x.button('Rule') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish({ ok: true, resources: { ...resources, scorers: [{ id: 'speed', name: 'Response speed', kind: 'latency', value: '1200' }] } }));
  await screen.findByText('Scorer saved to this project.');
});

it('disables an empty suite picker and allows searching larger suite lists', async () => {
  suites = [];
  const empty = setup('experiments', { projectId: 'picklist-empty' }); await empty.ready();
  expect((empty.button('Experiment suite') as HTMLButtonElement).disabled).toBe(true);
  expect(empty.button('Experiment suite').textContent).toBe('No evaluation suites available');
  empty.unmount();
  suites = Array.from({ length: 7 }, (_, index) => ({ id: `suite-${index}`, path: `tests/support-${index}.json`, cases: [] }));
  const x = setup('experiments', { projectId: 'picklist-search' }); await x.ready();
  fireEvent.click(x.button('Experiment suite'));
  fireEvent.change(screen.getByLabelText('Search evaluation suites…'), { target: { value: 'support-6' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.click(screen.getByRole('option', { name: 'tests/support-6.json · 0 cases' }));
  expect(x.button('Experiment suite').textContent).toContain('support-6.json');
});

it('retains a native thread scorer draft and filters when the host unmounts its tab', async () => {
  const x = setup('scorers', { workspaceKey: 'thread-scorer-retention' }); await x.ready();
  fireEvent.click(x.button('New scorer'));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unfinished policy rule' } });
  fireEvent.change(screen.getByLabelText('Text to match'), { target: { value: 'eligible' } });
  x.unmount();
  const y = setup('scorers', { workspaceKey: 'thread-scorer-retention' }); await y.ready();
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Unfinished policy rule');
  expect((screen.getByLabelText('Text to match') as HTMLInputElement).value).toBe('eligible');
  fireEvent.click(y.button('Save scorer')); await screen.findByText('Scorer saved to this project.');
  expect(resources.scorers[0]).toMatchObject({ name: 'Unfinished policy rule', value: 'eligible' });
});

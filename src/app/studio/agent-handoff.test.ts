import { beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@zana-ai/zcc-plugin-sdk/app', () => ({ callPluginRpc: rpc }));
import { handoffStudioAgent, showStudioAgentThread } from './agent-handoff.js';

const request = { projectId: 'project', path: 'force-app/Help.agent', action: 'address-comments' };
beforeEach(() => rpc.mockReset());

it('opens a project-scoped draft only when the host acknowledges it', async () => {
  rpc.mockResolvedValue({ ok: true, prompt: 'Address the comments', title: 'Comments' });
  const navigate = { openPanelAgent: vi.fn(() => true), toThread: vi.fn() };
  expect(await handoffStudioAgent('salesforce', navigate, request)).toEqual({ kind: 'draft' });
  expect(navigate.openPanelAgent).toHaveBeenCalledWith({ draft: { prompt: 'Address the comments', projectId: 'project', view: request.path }, title: 'Comments' });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(navigate.toThread).not.toHaveBeenCalled();
});

it('opens the created thread when the host refuses the draft', async () => {
  rpc.mockResolvedValueOnce({ ok: true, prompt: 'Address comments' }).mockResolvedValueOnce({ ok: true, threadId: 'thread', title: 'Comments' });
  const navigate = { openPanelAgent: vi.fn(options => Boolean(options.threadId)), toThread: vi.fn() };
  expect(await handoffStudioAgent('salesforce', navigate, { path: request.path })).toEqual({ kind: 'thread', threadId: 'thread' });
  expect(navigate.openPanelAgent.mock.calls).toEqual([[{ draft: { prompt: 'Address comments', view: request.path } }], [{ threadId: 'thread', title: 'Comments' }]]);
  expect(navigate.toThread).not.toHaveBeenCalled();
});

it('navigates to the created thread when neither draft nor existing-thread panels are available', async () => {
  rpc.mockResolvedValue({ ok: true, threadId: 'thread' });
  const navigate = { toThread: vi.fn() };
  expect(await handoffStudioAgent('salesforce', navigate, request)).toEqual({ kind: 'thread', threadId: 'thread' });
  expect(rpc).toHaveBeenCalledWith('salesforce', 'studio.askAgent', request);
  expect(navigate.toThread).toHaveBeenCalledWith('thread');
  const panel = vi.fn(() => false);
  showStudioAgentThread({ ...navigate, openPanelAgent: panel }, 'existing');
  expect(navigate.toThread).toHaveBeenLastCalledWith('existing');
});

it.each([null, { ok: false }, { ok: true, prompt: '' }, { ok: true, prompt: 1 }])('rejects an unacknowledged or malformed draft instead of silently starting an agent: %j', async value => {
  rpc.mockResolvedValue(value);
  const panel = vi.fn(() => true);
  await expect(handoffStudioAgent('salesforce', { openPanelAgent: panel }, request)).rejects.toThrow('Could not prepare the request.');
  expect(rpc).toHaveBeenCalledTimes(1); expect(panel).not.toHaveBeenCalled();
});

it.each([null, { ok: false }, { ok: false, error: 'Start refused' }, { ok: true }, { ok: true, threadId: 1 }, { ok: true, threadId: ' ' }])('rejects failed starts and missing thread identity: %j', async value => {
  rpc.mockResolvedValue(value);
  const toThread = vi.fn();
  await expect(handoffStudioAgent('salesforce', { toThread }, request)).rejects.toThrow();
  expect(toThread).not.toHaveBeenCalled();
});

it('preserves the host presentation refusal and never retries through a different launch', async () => {
  rpc.mockResolvedValue({ ok: false, code: 'presentation_unavailable', error: 'Desktop presentation is unavailable.' });
  await expect(handoffStudioAgent('salesforce', { openPanelAgent: vi.fn() }, request)).rejects.toThrow('Desktop presentation is unavailable.');
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('reports missing navigation and propagates a failed navigation without starting a duplicate', async () => {
  rpc.mockResolvedValue({ ok: true, threadId: 'thread' });
  await expect(handoffStudioAgent('salesforce', {}, request)).rejects.toThrow('Open it from Threads.');
  await expect(handoffStudioAgent('salesforce', { toThread: () => { throw new Error('Navigation failed'); } }, request)).rejects.toThrow('Navigation failed');
  expect(rpc).toHaveBeenCalledTimes(2);
});

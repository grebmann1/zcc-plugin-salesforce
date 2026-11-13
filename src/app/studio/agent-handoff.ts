import { callPluginRpc, type ZccNavigate } from '@zana-ai/zcc-plugin-sdk/app';
import { STUDIO_RPC } from '../../../lib/studio-contract.js';

type AgentNavigation = Partial<Pick<ZccNavigate, 'openPanelAgent' | 'toThread'>>;
export type StudioAgentHandoff = { kind: 'draft' } | { kind: 'thread'; threadId: string };

function reply(value: unknown, fallback: string): Record<string, unknown> {
  const result = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (result?.ok !== true) throw new Error(typeof result?.error === 'string' && result.error ? result.error : fallback);
  return result;
}

/** A host must accept the panel request or receive navigation to the created thread. */
export function showStudioAgentThread(navigate: AgentNavigation, threadId: string, title?: string): void {
  if (navigate.openPanelAgent?.({ threadId, ...(title ? { title } : {}) })) return;
  if (!navigate.toThread) throw new Error('The agent started, but this host cannot open its conversation. Open it from Threads.');
  navigate.toThread(threadId);
}

/** Uses public navigation only; the host retains authority over desktop presentation. */
export async function handoffStudioAgent(pluginId: string, navigate: AgentNavigation, request: Record<string, unknown> & { path: string; projectId?: string }): Promise<StudioAgentHandoff> {
  if (navigate.openPanelAgent) {
    const draft = reply(await callPluginRpc(pluginId, STUDIO_RPC.draftAgent, request), 'Could not prepare the request.');
    if (typeof draft.prompt !== 'string' || !draft.prompt.trim()) throw new Error('Could not prepare the request.');
    const title = typeof draft.title === 'string' ? draft.title : undefined;
    if (navigate.openPanelAgent({ draft: { prompt: draft.prompt, view: request.path, ...(request.projectId ? { projectId: request.projectId } : {}) }, ...(title ? { title } : {}) })) return { kind: 'draft' };
  }
  const result = reply(await callPluginRpc(pluginId, STUDIO_RPC.askAgent, request), 'Could not start the agent.');
  if (typeof result.threadId !== 'string' || !result.threadId.trim()) throw new Error('The agent did not return a conversation. Try again.');
  showStudioAgentThread(navigate, result.threadId, typeof result.title === 'string' ? result.title : undefined);
  return { kind: 'thread', threadId: result.threadId };
}

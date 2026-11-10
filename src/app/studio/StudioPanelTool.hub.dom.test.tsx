/** @vitest-environment happy-dom */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { studioPanelTool } from './StudioPanelTool.js';
import { registerHubStudioProject } from './studio-hub-context.js';
import { resetStudioToolBridge, studioToolScope, useStudioRegistration, useStudioToolSlots } from './studio-tool-bridge.js';

const Tool = studioPanelTool('comments', 'Comments');
let context: { surface: 'main' | 'plugin-view'; projectId?: string | null; resourceId?: string; sidePanel?: boolean };
let releaseHub: (() => void) | undefined;

function Studio({ projectId, studioId }: { projectId: string; studioId?: string }) {
  const scope = studioToolScope(projectId, studioId);
  useStudioRegistration(scope, true);
  const slots = useStudioToolSlots(scope);
  return <>{slots.map(slot => createPortal(<p>{projectId} comments</p>, slot.node, slot.tool))}</>;
}

function HubBinding({ projectId }: { projectId?: string }) {
  useEffect(() => projectId ? registerHubStudioProject(projectId) : undefined, [projectId]);
  return null;
}

beforeEach(() => {
  resetStudioToolBridge();
  context = { surface: 'main' };
  Object.assign(globalThis, { __ZCC_PLUGIN_RUNTIME__: { useZccContext: () => context } });
});
afterEach(() => {
  cleanup();
  releaseHub?.(); releaseHub = undefined;
  resetStudioToolBridge();
  delete (globalThis as { __ZCC_PLUGIN_RUNTIME__?: unknown }).__ZCC_PLUGIN_RUNTIME__;
});

describe('hub Studio side-panel tools', () => {
  it('binds a restored or New Tab tool to the chosen hub project and detaches on leaving', () => {
    const view = render(<><Studio projectId="a" /><Studio projectId="b" /><HubBinding projectId="a" /><Tool pluginId="salesforce" threadId="" params={null} surface="plugin-page" tabId="restored" /></>);
    expect(screen.getByText('a comments')).toBeTruthy();
    expect(screen.queryByText('b comments')).toBeNull();
    view.rerender(<><Studio projectId="a" /><Studio projectId="b" /><HubBinding projectId="b" /><Tool pluginId="salesforce" threadId="" params={null} surface="plugin-page" tabId="restored" /></>);
    expect(screen.getByText('b comments')).toBeTruthy();
    expect(screen.queryByText('a comments')).toBeNull();
    view.rerender(<><Studio projectId="a" /><Studio projectId="b" /><HubBinding /><Tool pluginId="salesforce" threadId="" params={null} surface="plugin-page" tabId="restored" /></>);
    expect(screen.queryByText('b comments')).toBeNull();
    expect(screen.getByText('Comments needs Agent Script Studio')).toBeTruthy();
  });

  it('keeps an explicit host project authoritative over the hub picker', () => {
    context.projectId = 'b';
    releaseHub = registerHubStudioProject('b');
    render(<><Studio projectId="a" /><Studio projectId="b" /><Tool pluginId="salesforce" projectId="a" threadId="" params={null} surface="plugin-page" /></>);
    expect(screen.getByText('a comments')).toBeTruthy();
    expect(screen.queryByText('b comments')).toBeNull();
  });

  it('uses a project-scoped host context when action props omit the project', () => {
    context.projectId = 'a';
    releaseHub = registerHubStudioProject('b');
    render(<><Studio projectId="a" /><Studio projectId="b" /><Tool pluginId="salesforce" threadId="" params={null} surface="plugin-page" /></>);
    expect(screen.getByText('a comments')).toBeTruthy();
    expect(screen.queryByText('b comments')).toBeNull();
  });

  it.each([undefined, 'thread', 'agent-session'] as const)('does not bind an unscoped %s tool to the hub', surface => {
    releaseHub = registerHubStudioProject('a');
    render(<><Studio projectId="a" /><Tool pluginId="salesforce" threadId="" params={null} surface={surface} /></>);
    expect(screen.queryByText('a comments')).toBeNull();
    expect(screen.getByText('Comments needs Agent Script Studio')).toBeTruthy();
  });

  it('does not bind a detached window without a project to the main-window hub', () => {
    context = { surface: 'plugin-view', resourceId: 'Help.agent', sidePanel: true };
    releaseHub = registerHubStudioProject('a');
    render(<><Studio projectId="a" studioId="Help.agent" /><Tool pluginId="salesforce" threadId="" params={null} surface="plugin-page" /></>);
    expect(screen.queryByText('a comments')).toBeNull();
    expect(screen.getByText('Comments needs Agent Script Studio')).toBeTruthy();
  });

  it('keeps an explicitly scoped detached window attached to its own Studio', () => {
    context = { surface: 'plugin-view', resourceId: 'Help.agent', sidePanel: true };
    releaseHub = registerHubStudioProject('b');
    render(<><Studio projectId="a" studioId="Help.agent" /><Studio projectId="b" /><Tool pluginId="salesforce" projectId="a" threadId="" params={null} surface="plugin-page" /></>);
    expect(screen.getByText('a comments')).toBeTruthy();
    expect(screen.queryByText('b comments')).toBeNull();
    act(() => releaseHub?.());
    expect(screen.getByText('a comments')).toBeTruthy();
  });
});

/** @vitest-environment happy-dom */
import * as React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectTestPluginApp } from '@zana-ai/zcc-plugin-sdk/testing/app';
import app from '../../app.tsx';

const Banner = collectTestPluginApp(app, 'salesforce').composerCustomizations[0]!.banners![0]!.component as React.ComponentType<{ pluginId?: string }>;
const noTarget = { dxProject: true, selectedAlias: '', orgs: [{ alias: 'dev' }] };
const connected = { ...noTarget, selectedAlias: 'dev' };
const rpc = vi.fn();
const realtime = vi.fn();
function changed(projectId: string | null = 'project') {
  window.dispatchEvent(new CustomEvent('sf:context-changed', { detail: { projectId } }));
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
}

describe('Salesforce composer connection hint', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue(noTarget);
    realtime.mockReset();
    vi.stubGlobal('__ZCC_HOST_REACT__', React);
    vi.stubGlobal('__ZCC_PLUGIN_HOST__', { callRpc: rpc });
    vi.stubGlobal('__ZCC_PLUGIN_RUNTIME__', {
      useComposerView: () => ({ scope: { kind: 'new-thread', projectId: 'project' } }),
      useRealtime: realtime,
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('clears the choose-org hint after the current project connects', async () => {
    render(<Banner pluginId="salesforce" />);
    await screen.findByText(/Salesforce: pick a CLI-connected org/);
    rpc.mockResolvedValue(connected);
    await act(async () => changed());
    await waitFor(() => expect(screen.queryByText(/Salesforce: pick/)).toBeNull());
    expect(rpc).toHaveBeenLastCalledWith('salesforce', 'status', { projectId: 'project', threadId: undefined });
  });

  it('ignores another project and refreshes global context changes', async () => {
    render(<Banner />);
    await screen.findByText(/Salesforce: pick/);
    await act(async () => changed('another-project'));
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValue(connected);
    await act(async () => changed(null));
    await waitFor(() => expect(screen.queryByText(/Salesforce: pick/)).toBeNull());
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('keeps a newer connected response when an older read arrives late', async () => {
    const old = deferred();
    rpc.mockReturnValueOnce(old.promise).mockResolvedValue(connected);
    render(<Banner />);
    await act(async () => changed());
    await act(async () => old.resolve(noTarget));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Salesforce: pick/)).toBeNull();
  });

  it('drops stale guidance if refreshing status fails', async () => {
    render(<Banner />);
    await screen.findByText(/Salesforce: pick/);
    rpc.mockRejectedValue(new Error('offline'));
    await act(async () => changed());
    await waitFor(() => expect(screen.queryByText(/Salesforce: pick/)).toBeNull());
  });

  it('relays a context change from another window', async () => {
    render(<Banner />);
    await screen.findByText(/Salesforce: pick/);
    rpc.mockResolvedValue(connected);
    expect(realtime).toHaveBeenCalled();
    const relay = realtime.mock.calls[0]![1];
    await act(async () => relay({ projectId: 'project', origin: 'other-window', changeId: 'composer-banner-test' }));
    await waitFor(() => expect(screen.queryByText(/Salesforce: pick/)).toBeNull());
  });

  it.each(['production', 'unknown'])('refreshes the %s confirmation warning after a context change', async kind => {
    rpc.mockResolvedValue(connected);
    render(<Banner />);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rpc.mockResolvedValue({ ...connected, selectedAlias: 'review-target', lastDoctor: { org: { kind } } });
    await act(async () => changed());
    await screen.findByText(new RegExp(`target org review-target (is production|kind is unknown)`));
    expect(screen.queryByText(/Salesforce: pick/)).toBeNull();
  });

  it('removes listeners and ignores a pending read after unmounting', async () => {
    const pending = deferred();
    rpc.mockReturnValue(pending.promise);
    const view = render(<Banner />);
    view.unmount();
    await act(async () => { changed(); pending.resolve(noTarget); });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Salesforce: pick/)).toBeNull();
  });
});

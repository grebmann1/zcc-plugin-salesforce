import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import { STUDIO_LIMITS, STUDIO_RPC, type StudioViewState } from '../../../lib/studio-contract.js';

export const VIEW_PUBLISH_DEBOUNCE_MS = 400;
// Renew well before the server's 60s TTL, even when the editor is idle.
export const VIEW_KEEPALIVE_MS = 20_000;
export const SHARE_STORAGE_KEY = 'salesforce:studio:share';

export type StudioViewInput = Omit<StudioViewState, 'share' | 'at'>;

/** Applies the contract's bounds so the server never rejects a publish for size. */
export function buildViewState(input: StudioViewInput, share: boolean, at: number): StudioViewState {
  return {
    ...input,
    selection: input.selection ? { ...input.selection, text: input.selection.text.slice(0, STUDIO_LIMITS.selectionText) } : undefined,
    diagnostics: input.diagnostics.slice(0, STUDIO_LIMITS.diagnostics),
    share, at
  };
}

function readShare(fallback: boolean): boolean {
  try { const raw = localStorage.getItem(SHARE_STORAGE_KEY); return raw === null ? fallback : raw === 'true'; } catch { return fallback; }
}

/**
 * Shares editor changes (debounced) and renews idle views while mounted. Closing
 * the view or turning sharing off withdraws it without the editor debounce.
 */
export function useStudioView(options: { pluginId: string; projectId?: string | null; threadId?: string | null; input: StudioViewInput; defaultShare?: boolean; debounceMs?: number }) {
  const { pluginId, projectId, threadId, input, defaultShare = true, debounceMs = VIEW_PUBLISH_DEBOUNCE_MS } = options;
  const [share, setShareState] = useState(() => readShare(defaultShare));
  const setShare = useCallback((next: boolean) => {
    setShareState(next);
    try { localStorage.setItem(SHARE_STORAGE_KEY, String(next)); } catch { /* preference is optional */ }
  }, []);
  const signature = JSON.stringify(input);
  const view = useMemo<StudioViewState>(() => buildViewState(JSON.parse(signature) as StudioViewInput, share, Date.now()), [signature, share]);
  const latestView = useRef(view);
  latestView.current = view;
  const schedulePublish = useRef<(() => void) | null>(null);
  const publisherId = useRef<string | null>(null);
  if (publisherId.current === null) publisherId.current = crypto.randomUUID();
  const sequence = useRef(0);

  useEffect(() => {
    if (!projectId) return undefined;
    let stopped = false;
    let pending: { at: number; view: StudioViewState } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const path = view.path;
    const scope = { projectId, ...(threadId ? { threadId } : {}) };
    const send = async (state: StudioViewState) => {
      try {
        await callPluginRpc(pluginId, STUDIO_RPC.viewPublish, {
          ...scope, state, publisher: { id: publisherId.current!, sequence: ++sequence.current }
        });
      } catch { /* a later keepalive retries without requiring an editor change */ }
    };
    // A withdrawal needs only the identity of the view, never its selected text.
    const withdraw = () => {
      void send({ surface: view.surface, path, dirty: false, tool: null, diagnostics: [], share: false, at: Date.now() });
    };
    const publish = () => {
      if (stopped || pending && Date.now() - pending.at < VIEW_KEEPALIVE_MS) return;
      clearTimeout(timer);
      const request = { at: Date.now(), view: latestView.current };
      pending = request;
      // A stalled host call must not block withdrawal or later keepalives. Its
      // lower sequence cannot overwrite a newer snapshot after it arrives late.
      void send({ ...request.view, at: request.at }).then(() => {
        if (pending !== request) return;
        pending = null;
        if (!stopped && request.view !== latestView.current) schedule();
      });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(publish, debounceMs);
    };
    schedulePublish.current = share ? schedule : null;
    if (share) schedule();
    else withdraw();
    const keepalive = share ? setInterval(publish, VIEW_KEEPALIVE_MS) : undefined;
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(keepalive);
      schedulePublish.current = null;
      withdraw();
    };
  }, [pluginId, projectId, threadId, share, view.path, view.surface, debounceMs]);

  useEffect(() => { schedulePublish.current?.(); }, [signature]);

  return { view, share, setShare };
}

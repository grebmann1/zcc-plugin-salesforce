import { useEffect, useRef, useState, type RefObject } from 'react';
import { useRealtime } from '@zana-ai/zcc-plugin-sdk/app';
import { STUDIO_CHANGED_CHANNEL } from '../../../lib/studio-contract.js';

export const REFERENCE_POLL_MS = 5000;
export type ReferenceRefreshReason = 'initial' | 'manual' | 'files' | 'focus' | 'poll';
export interface ReferenceRead<T> {
  reason: ReferenceRefreshReason;
  previous: T | undefined;
  isCurrent(): boolean;
}

/** Hidden visited tools stay mounted. Do not poll their source, or a background window. */
export function referenceVisible(element: HTMLElement | null): boolean {
  if (!element?.isConnected || document.visibilityState === 'hidden') return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/** Project identity must match exactly. A pathless event invalidates the whole project. */
export function referenceFileChange(payload: unknown, projectId: string | undefined, paths: string[] = []): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const row = payload as { kind?: unknown; projectId?: unknown; path?: unknown };
  if (row.kind !== 'files' || row.projectId !== projectId) return false;
  if (row.path === undefined) return true;
  if (typeof row.path !== 'string' || !row.path) return false;
  const changedPath = row.path;
  return !paths.length || paths.some(path => changedPath === path || changedPath.startsWith(`${path}/`));
}

/** One bounded read at a time. Errors retain the last snapshot; a later read or Refresh retries. */
export function useReferenceRefresh<T>(options: {
  scope: string;
  projectId?: string;
  element: RefObject<HTMLElement | null>;
  enabled?: boolean;
  automatic?: boolean;
  initial?: T;
  paths?(data: T | undefined): string[];
  read(request: ReferenceRead<T>): Promise<T>;
  remember?(data: T): void;
}) {
  const config = useRef(options);
  config.current = options;
  const { scope, enabled = true, automatic = true } = options;
  const [state, setState] = useState<{ scope: string; data?: T; error?: string; busy: boolean; revision: number }>({ scope, data: options.initial, busy: enabled, revision: 0 });
  const runner = useRef<(reason: ReferenceRefreshReason) => void>(() => {});
  useRealtime(STUDIO_CHANGED_CHANNEL, payload => {
    const current = config.current;
    if (current.automatic !== false && referenceFileChange(payload, current.projectId, current.paths?.(state.scope === current.scope ? state.data : undefined))) runner.current('files');
  });
  useEffect(() => {
    let active = true;
    let running = false;
    let queued: ReferenceRefreshReason | undefined;
    let data = config.current.initial;
    let revision = 0;
    const current = () => active && config.current.scope === scope;
    setState({ scope, data, busy: enabled, revision });
    const run = (reason: ReferenceRefreshReason) => {
      if (!enabled || !current()) return;
      if (reason !== 'initial' && reason !== 'manual' && !referenceVisible(config.current.element.current)) return;
      if (running) {
        // Polling must never build a backlog. Coalesce actual invalidations to one follow-up read.
        if (reason === 'files' || reason === 'manual') queued = reason;
        return;
      }
      running = true;
      setState(previous => ({ ...previous, busy: true }));
      const request = config.current;
      void (async () => current() ? request.read({ reason, previous: data, isCurrent: current }) : undefined)().then(next => {
        if (!current()) return;
        // Keep object identity (and expensive maps/sketches) when a disk probe finds no change.
        if (JSON.stringify(data) !== JSON.stringify(next)) { data = next; revision++; }
        config.current.remember?.(data!);
        setState({ scope, data, busy: false, revision });
      }).catch(error => {
        if (current()) setState({ scope, data, busy: false, revision, error: error instanceof Error ? error.message : String(error) });
      }).finally(() => {
        running = false;
        if (queued && current()) { const reason = queued; queued = undefined; run(reason); }
      });
    };
    runner.current = run;
    run('initial');
    const recover = () => run('focus');
    const timer = automatic && enabled ? window.setInterval(() => run('poll'), REFERENCE_POLL_MS) : undefined;
    if (automatic && enabled) {
      window.addEventListener('focus', recover);
      document.addEventListener('visibilitychange', recover);
    }
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [scope, enabled, automatic]);
  return { ...(state.scope === scope ? state : { data: options.initial, error: undefined, busy: enabled, revision: 0 }), refresh: () => runner.current('manual') };
}

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { callPluginRpc, useRealtime } from '@zana-ai/zcc-plugin-sdk/app';
import { STUDIO_CHANGED_CHANNEL, STUDIO_RPC, type ExplorerNode, type ScenarioSuite } from '../../../lib/studio-contract.js';
import { referenceVisible } from './useReferenceRefresh.js';

/** Overall result of a suite from its saved last results: fail beats pass; no results means no badge. */
export function suiteStatus(suite: ScenarioSuite): 'pass' | 'fail' | undefined {
  const outcomes = Object.values(suite.lastResults ?? {}).map(result => result.outcome);
  if (outcomes.length === 0) return undefined;
  if (outcomes.some(outcome => outcome === 'fail')) return 'fail';
  return outcomes.every(outcome => outcome === 'pass') ? 'pass' : undefined;
}

/** Adds pass/fail badges to scenario nodes whose suite has results. */
export function withSuiteBadges(nodes: ExplorerNode[], suites: ScenarioSuite[]): ExplorerNode[] {
  if (suites.length === 0) return nodes;
  return nodes.map(node => {
    if (node.kind !== 'scenario') return node;
    const suite = suites.find(row => row.path === node.path);
    const status = suite ? suiteStatus(suite) : undefined;
    return status ? { ...node, badge: { ...node.badge, status } } : node;
  });
}

/** Saved scenario suites of the project (studio.suites.list), refreshed when a suite changes. */
export function useSuiteList(pluginId: string, projectId?: string, options?: { visible?: boolean; agentPath?: string; suitePath?: string | null; element?: RefObject<HTMLElement | null> }) {
  const key = JSON.stringify([pluginId, projectId, options?.agentPath]);
  const [saved, setSaved] = useState<{ key: string; suites: ScenarioSuite[] }>({ key, suites: [] });
  const alive = useRef(true);
  const scope = useMemo(() => ({ pending: null as Promise<boolean> | null, again: false }), [key]);
  const target = useRef(scope); target.current = scope;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback((fresh = true): Promise<boolean> => {
    if (!projectId || target.current !== scope || !alive.current) return Promise.resolve(false);
    if (scope.pending) { scope.again ||= fresh; return scope.pending; }
    scope.pending = (async () => {
      let ok = false;
      do {
        scope.again = false;
        try {
          const result = await callPluginRpc(pluginId, STUDIO_RPC.suites, { projectId, ...(options?.agentPath ? { agentPath: options.agentPath } : {}) }) as { ok?: boolean; suites?: ScenarioSuite[] } | null;
          if (!alive.current || target.current !== scope) return false;
          ok = result?.ok !== false && Array.isArray(result?.suites);
          if (ok) setSaved({ key, suites: result!.suites! });
        } catch { ok = false; }
      } while (scope.again && alive.current && target.current === scope);
      return alive.current && target.current === scope && ok;
    })().finally(() => { scope.pending = null; });
    return scope.pending;
  }, [pluginId, projectId, key, scope, options?.agentPath]);
  useEffect(() => { void load(); }, [load]);
  useRealtime(STUDIO_CHANGED_CHANNEL, payload => {
    const row = payload as { kind?: string; projectId?: string; path?: string } | null;
    if (!row || (row.projectId && row.projectId !== projectId)) return;
    const related = !options?.suitePath || !row.path || row.path === options.suitePath;
    if (related && (row.kind === 'suites' || row.kind === 'suite-progress' || (row.kind === 'files' && row.projectId === projectId && (!row.path || row.path.endsWith('.scenario.json'))))) void load();
  });
  useEffect(() => {
    if (!projectId || options?.visible === false) return;
    const refresh = () => { if (options?.element ? referenceVisible(options.element.current) : document.visibilityState !== 'hidden') void load(false); };
    const timer = setInterval(refresh, 5_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [projectId, options?.visible, options?.element, load]);
  return { suites: saved.key === key ? saved.suites : [], refresh: load };
}

export function useSuites(pluginId: string, projectId?: string): ScenarioSuite[] { return useSuiteList(pluginId, projectId).suites; }

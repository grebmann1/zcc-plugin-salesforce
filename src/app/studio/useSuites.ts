import { useCallback, useEffect, useRef, useState } from 'react';
import { callPluginRpc, useRealtime } from '@zana-ai/zcc-plugin-sdk/app';
import { STUDIO_CHANGED_CHANNEL, STUDIO_RPC, type ExplorerNode, type ScenarioSuite } from '../../../lib/studio-contract.js';

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
export function useSuiteList(pluginId: string, projectId?: string) {
  const [suites, setSuites] = useState<ScenarioSuite[]>([]);
  const alive = useRef(true);
  const sequence = useRef(0);
  const latestLoad = useRef<Promise<boolean> | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback((): Promise<boolean> => {
    const request = ++sequence.current;
    if (!projectId) { setSuites([]); const pending = Promise.resolve(false); latestLoad.current = pending; return pending; }
    const pending = (async () => {
    try {
      const result = await callPluginRpc(pluginId, STUDIO_RPC.suites, { projectId }) as { ok?: boolean; suites?: ScenarioSuite[] } | null;
      if (alive.current && request === sequence.current && result?.ok !== false && Array.isArray(result?.suites)) { setSuites(result.suites); return true; }
    } catch { /* badges and the Tests tab are optional */ }
    // An opening Tests command follows the newer realtime refresh rather than
    // reporting a false failure (or acknowledging its older saved results).
    if (alive.current && request !== sequence.current) return latestLoad.current ?? false;
    return false;
    })();
    latestLoad.current = pending;
    return pending;
  }, [pluginId, projectId]);
  useEffect(() => { setSuites([]); void load(); }, [load]);
  useRealtime(STUDIO_CHANGED_CHANNEL, payload => {
    const row = payload as { kind?: string; projectId?: string } | null;
    if ((row?.kind === 'suites' || row?.kind === 'suite-progress') && (!row.projectId || row.projectId === projectId)) void load();
  });
  return { suites, refresh: load };
}

export function useSuites(pluginId: string, projectId?: string): ScenarioSuite[] { return useSuiteList(pluginId, projectId).suites; }

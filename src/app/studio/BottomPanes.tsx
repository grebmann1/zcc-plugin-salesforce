import { useEffect, useState } from 'react';
import { callPluginRpc } from '@zana-ai/zcc-plugin-sdk/app';
import type { LabSnapshot } from '../../../lib/agentforce-lab-contract.js';
import { STUDIO_RPC, type StudioEngine, type TurnTrace } from '../../../lib/studio-contract.js';
import { TRACE_PANEL_STYLES, TracePanel } from '../preview/TracePanel.js';
import { focusedReply, type TraceFocus } from '../preview/trace-focus.js';
export { BottomTests } from './BottomTests.js';

/** Trace tab: the planner trace of the latest Preview run (Simulate / Live); Rehearse has no runtime trace. */
type BottomTraceProps = {
  pluginId: string;
  projectId?: string;
  path: string | null;
  run: { runId: string; engine: StudioEngine; turn: number } | null;
  focus?: TraceFocus;
  visible: boolean;
  onRevealSource?(path: string, line: number): void;
  onOpenPreview(): void;
};

export function BottomTrace(props: BottomTraceProps) {
  // A changed owner/target immediately removes the previous trace, even before effects run.
  const { pluginId, projectId, path, run, focus, visible } = props;
  return <BottomTraceContent key={JSON.stringify([pluginId, projectId, path, run?.runId, run?.engine, run?.turn, focus, visible])} {...props} />;
}

function BottomTraceContent({ pluginId, projectId, path, run, focus, visible, onRevealSource, onOpenPreview }: BottomTraceProps) {
  const [trace, setTrace] = useState<TurnTrace | null>(null);
  const [loading, setLoading] = useState(Boolean(visible && (focus || (run && run.engine !== 'rehearse'))));
  const [error, setError] = useState<string | null>(null);
  const [approximation, setApproximation] = useState(false);
  const runId = focus?.runId ?? run?.runId; const engine = run?.engine; const turn = run?.turn;
  const focusTurn = focus?.turn; const focusSeq = focus?.seq;
  useEffect(() => {
    if (!visible || !runId || (!focus && (!engine || engine === 'rehearse'))) { setLoading(false); return; }
    let cancelled = false;
    const scope = projectId ? { projectId } : {};
    void (async () => {
      let target: { planId?: string; turn?: number; engine?: StudioEngine } = { engine };
      if (focus) {
        const result = await callPluginRpc(pluginId, 'agentLab.get', { ...scope, id: runId }) as { ok?: boolean; data?: LabSnapshot; error?: string } | null;
        if (cancelled) return;
        if (!result?.ok || !result.data) throw Error(result?.error || 'This run is no longer available.');
        if (result.data.id !== runId) throw Error('The requested run is unavailable.');
        target = focusedReply(result.data, path, focusTurn);
        if (target.engine === 'rehearse') { setApproximation(true); return; }
        if (!target.planId) throw Error('This reply has no plan to trace.');
      }
      const reply = await callPluginRpc(pluginId, STUDIO_RPC.trace, { ...scope, id: runId, ...target, ...(path ? { path } : {}) }) as { ok?: boolean; data?: TurnTrace; error?: string } | null;
      if (cancelled) return;
      if (reply?.ok !== false && reply?.data) setTrace(reply.data); else setError(reply?.error || 'The trace is unavailable.');
    })().catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pluginId, projectId, path, runId, engine, turn, visible, focusTurn, focusSeq]);
  return <div className="sf-bottom-trace" data-testid="studio-trace-pane">
    <style>{TRACE_PANEL_STYLES}</style>
    {!run && !focus && <p className="sf-problems-empty">Run a conversation in Preview to see the planner trace.</p>}
    {!focus && run?.engine === 'rehearse' && <TracePanel trace={null} approximation />}
    {(focus || (run && run.engine !== 'rehearse')) && <>
      <TracePanel trace={trace} loading={loading} approximation={approximation} onRevealSource={onRevealSource} focusStep={focus?.step} focusSeq={focus?.seq} />
      {error && <p className="sf-problems-empty" role="alert">{error}</p>}
    </>}
    <div className="sf-problems-empty"><button type="button" className="sf-btn-small" onClick={onOpenPreview}>Open Preview</button></div>
  </div>;
}

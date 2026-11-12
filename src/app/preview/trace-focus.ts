import type { LabSnapshot } from '../../../lib/agentforce-lab-contract.js';
import type { StudioEngine } from '../../../lib/studio-contract.js';

export interface TraceFocus {
  runId: string;
  /** Agent reply number (1-based). Zero, like omission, selects the latest reply. */
  turn?: number;
  /** Trace step index (0-based). */
  step?: number;
  seq: number;
}

/** A retained run may be inspected only for the editor that owns this request. */
export function focusedReply(run: LabSnapshot, path: string | null, requestedTurn?: number): { turn: number; planId?: string; engine: StudioEngine } {
  if (!path || run.path !== path) throw Error('This run does not belong to the open agent.');
  const replies = run.turns.filter(reply => reply.role === 'agent');
  const turn = requestedTurn || replies.length;
  if (!Number.isInteger(turn) || turn < 1 || turn > replies.length) throw Error('The requested agent reply is unavailable.');
  return { turn, planId: replies[turn - 1].planId, engine: run.engine === 'rehearsal' ? 'rehearse' : run.live ? 'live' : 'simulate' };
}

import { describe, expect, it } from 'vitest';
import type { LabSnapshot } from '../../../lib/agentforce-lab-contract.js';
import { focusedReply } from './trace-focus.js';

const run: LabSnapshot = { id: 'r', path: 'Help.agent', orgAlias: 'dev', engine: 'preview', model: 'm', sourceHash: 'h', closed: true, failed: false,
  turns: [{ role: 'agent', text: 'Welcome' }, { role: 'user', text: 'Hi' }, { role: 'agent', text: 'Hello', planId: 'p2' }] };

describe('focusedReply', () => {
  it('selects exact 1-based agent replies and defaults zero or omission to latest', () => {
    expect(focusedReply(run, 'Help.agent', 1)).toEqual({ turn: 1, planId: undefined, engine: 'simulate' });
    expect(focusedReply(run, 'Help.agent', 2)).toEqual({ turn: 2, planId: 'p2', engine: 'simulate' });
    expect(focusedReply(run, 'Help.agent')).toEqual(focusedReply(run, 'Help.agent', 0));
    expect(focusedReply({ ...run, live: true }, 'Help.agent').engine).toBe('live');
    expect(focusedReply({ ...run, engine: 'rehearsal' }, 'Help.agent').engine).toBe('rehearse');
  });
  it('fails closed for absent/mismatched ownership and unavailable replies', () => {
    for (const path of [null, 'Other.agent']) expect(() => focusedReply(run, path)).toThrow('does not belong');
    expect(() => focusedReply({ ...run, path: undefined }, 'Help.agent')).toThrow('does not belong');
    for (const turn of [-1, 0.5, 3]) expect(() => focusedReply(run, 'Help.agent', turn)).toThrow('reply is unavailable');
    expect(() => focusedReply({ ...run, turns: [] }, 'Help.agent')).toThrow('reply is unavailable');
  });
});

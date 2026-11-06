import { describe, expect, it, vi } from 'vitest';
import { BUILDER_RPC, emptyBuilderResources, parseBuilderResources, parseToolManifest, scoreEvidence } from '../lib/studio-builder-contract.js';
import { registerStudioBuilder } from '../lib/studio-builder.js';
import type { StudioServerContext } from '../lib/studio-server-context.js';
import { caseResult } from '../lib/scenario-suites.js';

const scorer = { id: 'policy', name: 'Policy', kind: 'contains', value: '30 days' };
describe('Builder resources', () => {
  it('whitelists portable rules, notes and non-executable tool shortcuts', () => {
    const result = parseBuilderResources({ ...emptyBuilderResources(), secret: 'discard', scorers: [{ ...scorer, executable: 'discard' }], artifacts: [{ id: 'plan', name: ' Plan.md ', content: '# Plan' }], shortcuts: [{ id: 'quality', name: 'Quality', description: 'Saved outcomes', tool: 'analytics' }] });
    expect(result).toEqual({ revision: 0, scorers: [scorer], artifacts: [{ id: 'plan', name: 'Plan.md', content: '# Plan' }], shortcuts: [{ id: 'quality', name: 'Quality', description: 'Saved outcomes', tool: 'analytics' }] });
    expect(parseToolManifest({ name: 'Quality', description: '', tool: 'issues', script: 'discard' })).toEqual({ name: 'Quality', description: '', tool: 'issues' });
  });
  it.each([
    null, [], { revision: -1 }, { ...emptyBuilderResources(), revision: 1.1 },
    { ...emptyBuilderResources(), scorers: [{ ...scorer, id: '../../escape' }] },
    { ...emptyBuilderResources(), scorers: [scorer, scorer] },
    { ...emptyBuilderResources(), scorers: Array(51).fill(scorer) },
    { ...emptyBuilderResources(), scorers: [{ ...scorer, name: ' ' }] },
    { ...emptyBuilderResources(), scorers: [{ ...scorer, kind: 'javascript' }] },
    { ...emptyBuilderResources(), scorers: [{ ...scorer, value: '\0' }] },
    ...['0', '-1', 'Infinity', '600001', 'NaN'].map(value => ({ ...emptyBuilderResources(), scorers: [{ ...scorer, kind: 'latency', value }] })),
    { ...emptyBuilderResources(), artifacts: [{ id: 'note', name: 'Note', content: 5 }] },
    { ...emptyBuilderResources(), artifacts: [{ id: 'note', name: 'Note', content: 'a'.repeat(50001) }] },
    { ...emptyBuilderResources(), extra: 'a'.repeat(750001) },
    { ...emptyBuilderResources(), shortcuts: [{ id: 'x', name: 'X', tool: 'https://example.com', description: '' }] },
    { ...emptyBuilderResources(), shortcuts: [{ id: 'x', name: 'X', tool: 'import', description: '' }] },
    { ...emptyBuilderResources(), shortcuts: [{ id: 'x', name: 'X', tool: 'terminal', description: '' }] },
    { ...emptyBuilderResources(), shortcuts: [{ id: 'x', name: 'X', tool: 'analytics', description: 'a'.repeat(501) }] },
  ])('rejects invalid or unbounded documents %#', value => expect(() => parseBuilderResources(value)).toThrow());
  it('scores only present evidence and treats text case-insensitively', () => {
    const rule = parseBuilderResources({ ...emptyBuilderResources(), scorers: [scorer, { ...scorer, id: 'speed', kind: 'latency', value: '2000' }] }).scorers;
    expect(scoreEvidence(rule[0], { reply: 'Within 30 DAYS' })).toBe('pass');
    expect(scoreEvidence(rule[0], { reply: 'No returns' })).toBe('fail');
    expect(scoreEvidence(rule[0], {})).toBe('inconclusive');
    expect(scoreEvidence({ ...rule[0], kind: 'excludes' }, { reply: 'No returns' })).toBe('pass');
    expect(scoreEvidence({ ...rule[0], kind: 'excludes' }, { reply: '30 days' })).toBe('fail');
    expect(scoreEvidence(rule[1], {})).toBe('inconclusive');
    expect(scoreEvidence(rule[1], { latencyMs: 2000 })).toBe('pass');
    expect(scoreEvidence(rule[1], { latencyMs: 2001 })).toBe('fail');
    expect(() => parseToolManifest(null)).toThrow();
  });
  it('scores the complete final saved response rather than its clipped preview', () => {
    const rule = { ...scorer, kind: 'contains' as const };
    const evidence = caseResult({ caseId: 'c', outcome: 'pass', runId: 'r', at: 1, notes: [], turns: [
      { role: 'user', text: 'Ask about returns' }, { role: 'agent', text: `${'x'.repeat(600)} Within 30 DAYS` },
    ] });
    expect(evidence.reply).not.toContain('30 DAYS');
    expect(scoreEvidence(rule, evidence)).toBe('pass');
    expect(scoreEvidence({ ...rule, kind: 'excludes' }, evidence)).toBe('fail');
  });
  it('does not infer absence from clipped evidence or score an earlier agent or customer message', () => {
    const rule = { ...scorer, kind: 'contains' as const };
    const clipped = caseResult({ caseId: 'c', outcome: 'pass', runId: 'r', at: 1, notes: [], turns: [
      { role: 'agent', text: `${'x'.repeat(4500)} 30 days` },
    ] });
    expect(scoreEvidence(rule, clipped)).toBe('inconclusive');
    expect(scoreEvidence({ ...rule, kind: 'excludes' }, clipped)).toBe('inconclusive');
    expect(scoreEvidence(rule, { reply: 'x'.repeat(480) })).toBe('inconclusive');
    expect(scoreEvidence(rule, { reply: 'x'.repeat(480), replyTruncated: false })).toBe('fail');
    expect(scoreEvidence(rule, { reply: 'x'.repeat(480), replyTruncated: true, conversation: [{ role: 'agent', message: 'Different earlier response' }] })).toBe('inconclusive');
    expect(scoreEvidence(rule, { conversation: [{ role: 'agent', message: '30 days' }, { role: 'user', message: '30 days' }, { role: 'agent', message: 'Ask support' }] })).toBe('fail');
    expect(scoreEvidence(rule, { reply: '30 days', conversationTruncated: true })).toBe('pass');
    expect(scoreEvidence({ ...rule, kind: 'excludes' }, { reply: '30 days', conversationTruncated: true })).toBe('fail');
  });
  it.each(['stopped', 'setupBlocked'] as const)('does not score %s attempts as completed responses', flag => {
    expect(scoreEvidence({ ...scorer, kind: 'contains' }, { reply: '30 days', [flag]: true })).toBe('inconclusive');
    expect(scoreEvidence({ ...scorer, kind: 'latency', value: '2000' }, { latencyMs: 100, [flag]: true })).toBe('inconclusive');
  });
  it.each([NaN, Infinity, -1])('does not pass invalid recorded latency %s', latencyMs => {
    expect(scoreEvidence({ ...scorer, kind: 'latency', value: '2000' }, { latencyMs })).toBe('inconclusive');
  });
});

function fixture() {
  const docs = new Map<string, unknown>(), handlers = new Map<string, (args?: unknown) => any>();
  let project: string | undefined = 'p1';
  const set = vi.fn(async (key: string, value: unknown) => { docs.set(key, value); });
  const publish = vi.fn();
  registerStudioBuilder({ registerRpc: (name, fn) => { handlers.set(name, fn); }, contexts: { current: () => project ? { projectId: project } : undefined }, zcc: { storage: { kv: { get: async (key: string) => docs.get(key), set } }, realtime: { publish } } } as unknown as StudioServerContext);
  return { docs, set, publish, project: (value?: string) => { project = value; }, call: (method: string, args?: unknown) => handlers.get(method)!(args) };
}
describe('Builder project storage', () => {
  it('requires the host-resolved project and never trusts a project from the payload', async () => {
    const f = fixture();
    expect(await f.call(BUILDER_RPC.get)).toEqual({ ok: true, resources: emptyBuilderResources() });
    expect(await f.call(BUILDER_RPC.save, { projectId: 'p2', resources: { ...emptyBuilderResources(), scorers: [scorer] } })).toMatchObject({ ok: true, resources: { revision: 1 } });
    expect(f.docs.has('studio:builder:v1:p2')).toBe(false);
    f.project('p2'); expect(await f.call(BUILDER_RPC.get)).toMatchObject({ resources: { revision: 0, scorers: [] } });
    f.project(); expect(await f.call(BUILDER_RPC.get)).toMatchObject({ code: 'project_required' });
    expect(await f.call(BUILDER_RPC.save, {})).toMatchObject({ code: 'project_required' });
  });
  it('serializes writes, refuses stale windows, and publishes only committed changes', async () => {
    const f = fixture(), resources = emptyBuilderResources();
    const result = await Promise.all([f.call(BUILDER_RPC.save, { resources }), f.call(BUILDER_RPC.save, { resources })]);
    expect(result.map(row => row.ok)).toEqual([true, false]);
    expect(result[1].code).toBe('conflict'); expect(f.publish).toHaveBeenCalledTimes(1);
    expect(await f.call(BUILDER_RPC.save, { resources: { ...resources, revision: 1 } })).toMatchObject({ ok: true, resources: { revision: 2 } });
    expect(await f.call(BUILDER_RPC.get)).toMatchObject({ resources: { revision: 2 } });
    expect(await f.call(BUILDER_RPC.save, { resources: null })).toMatchObject({ code: 'invalid' });
  });
  it('retires saved console shortcuts without losing other resources or the optimistic revision', async () => {
    const f = fixture();
    const resources = { revision: 7, scorers: [scorer], artifacts: [{ id: 'notes', name: 'Notes.md', content: 'Keep this plan' }], shortcuts: [{ id: 'quality', name: 'Quality', description: '', tool: 'analytics' }] };
    f.docs.set('studio:builder:v1:p1', { ...resources, shortcuts: [...resources.shortcuts, { id: 'old-console', name: 'Console', description: '', tool: 'terminal' }] });
    expect(await f.call(BUILDER_RPC.get)).toEqual({ ok: true, resources });
    expect(f.set).not.toHaveBeenCalled();
    expect(await f.call(BUILDER_RPC.save, { resources })).toMatchObject({ ok: true, resources: { ...resources, revision: 8 } });
    expect(await f.call(BUILDER_RPC.get)).toEqual({ ok: true, resources: { ...resources, revision: 8 } });
    expect(() => parseToolManifest({ name: 'Console', description: '', tool: 'terminal' })).toThrow('Choose a supported tool');
  });
  it('acknowledges committed resources even if realtime is unavailable', async () => {
    const f = fixture(); f.publish.mockImplementation(() => { throw Error('Disconnected'); });
    expect(await f.call(BUILDER_RPC.save, { resources: emptyBuilderResources() })).toMatchObject({ ok: true, resources: { revision: 1 } });
    expect(await f.call(BUILDER_RPC.get)).toMatchObject({ resources: { revision: 1 } });
  });
  it('recovers the write queue after storage failure', async () => {
    const f = fixture(); f.set.mockRejectedValueOnce(Error('disk full'));
    await expect(f.call(BUILDER_RPC.save, { resources: emptyBuilderResources() })).rejects.toThrow('disk full');
    expect(await f.call(BUILDER_RPC.save, { resources: emptyBuilderResources() })).toMatchObject({ ok: true });
    expect(f.publish).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  QUERY_SQL_PATH, aggregateAnalytics, classifyFailure, interactionsSql, registerOrgAnalytics, sessionsSql, sqlRows, sqlTimestamp, windowStart,
} from '../lib/org-analytics.js';
import {
  ANALYTICS_LIMITS, ORG_ANALYTICS_RPC, analyticsPeriodHours, isEscalatedEndType, isRecordedEndType, parseAnalyticsPeriod, summarizeAnalytics, summarizeEscalation,
  type AnalyticsAgentRow, type AnalyticsOverviewReady,
} from '../lib/org-analytics-contract.js';

const org = { alias: 'dev', username: 'u', orgId: '00D1', instanceUrl: 'https://x', apiVersion: '63.0', kind: 'sandbox' };
const row = (agent: string, sessions: number, recorded: number, escalated: number | null): AnalyticsAgentRow =>
  ({ agent, sessions, interactions: sessions * 2, interactionsPerSession: 2, recorded, escalated });

describe('contract', () => {
  it('parses periods and end types', () => {
    expect(parseAnalyticsPeriod('30d')).toBe('30d');
    expect(parseAnalyticsPeriod('x; DROP')).toBe('7d');
    expect(['24h', '7d', '30d'].map(p => analyticsPeriodHours(p as never))).toEqual([24, 168, 720]);
    expect(isEscalatedEndType('Escalated')).toBe(true);
    expect(isEscalatedEndType('Completed')).toBe(false);
    expect(isRecordedEndType('NOT_SET')).toBe(false);
    expect(isRecordedEndType(' ')).toBe(false);
    expect(isRecordedEndType(null)).toBe(false);
    expect(isRecordedEndType('Completed')).toBe(true);
  });
  it('weights escalation by recorded sessions, not by agent', () => {
    const e = summarizeEscalation([row('a', 90, 90, 0), row('b', 2, 2, 2)])!;
    expect(e.rate).toBeCloseTo(2 / 92);
    expect(e.averageOfRates).toBeCloseTo(0.5);
    expect(summarizeEscalation([row('a', 5, 0, null)])).toBeNull();
  });
  it('summarizes one population for kpis, trend and table', () => {
    const overview = {
      agents: [row('a', 3, 3, 1), row('b', 2, 0, null), row('empty', 0, 0, null)],
      daily: [{ agent: 'a', day: '2026-01-01', sessions: 1 }, { agent: 'a', day: '2026-01-03', sessions: 2 }, { agent: 'b', day: '2026-01-02', sessions: 2 }, { agent: 'a', day: 'bad', sessions: 9 }],
    } as unknown as AnalyticsOverviewReady;
    const all = summarizeAnalytics(overview);
    expect(all.totals).toEqual({ sessions: 5, interactions: 10, agentsWithData: 2, agents: 3 });
    expect(all.daily).toEqual([{ day: '2026-01-01', sessions: 1 }, { day: '2026-01-02', sessions: 2 }, { day: '2026-01-03', sessions: 2 }]);
    const one = summarizeAnalytics(overview, 'b');
    expect(one.agents).toHaveLength(1);
    expect(one.escalation).toBeNull();
    expect(summarizeAnalytics(overview, 'missing')).toMatchObject({ daily: [], totals: { sessions: 0, agents: 0 }, escalation: null });
  });
});

describe('sql and parsing', () => {
  it('builds timestamps from the clock only', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    expect(sqlTimestamp(windowStart('24h', now))).toBe('2026-11-09 12:00:00');
    const sql = sessionsSql('2026-11-03 12:00:00');
    expect(sql).toContain("TIMESTAMP '2026-11-03 12:00:00'");
    expect(sql).toContain(`LIMIT ${ANALYTICS_LIMITS.groups + 1}`);
    expect(interactionsSql('2026-11-03 12:00:00')).toContain('COUNT(DISTINCT i.ssot__Id__c)');
    expect(interactionsSql('2026-11-03 12:00:00')).toContain(`LIMIT ${ANALYTICS_LIMITS.agents + 1}`);
  });
  it('reads rows by column name', () => {
    expect(sqlRows({ metadata: [{ name: 'agent' }, { name: 'n' }], data: [['a', 1], 'junk', ['b']] })).toEqual([{ agent: 'a', n: 1 }, { agent: 'b', n: undefined }]);
    expect(sqlRows({ data: [[1]] })).toEqual([]);
    expect(sqlRows(null)).toEqual([]);
  });
  it('aggregates sessions, outcomes and interactions', () => {
    const out = aggregateAnalytics([
      { agent: 'a', day: '2026-01-01', end_type: 'NOT_SET', sessions: 4 },
      { agent: 'a', day: '2026-01-01', end_type: 'Escalated', sessions: '1' },
      { agent: 'a', day: '2026-01-02', end_type: 'Completed', sessions: 5 },
      { agent: '', day: '2026-01-02', end_type: 'Completed', sessions: 5 },
      { agent: 'b', day: 'x', end_type: null, sessions: -3 },
    ], [{ agent: 'a', interactions: 20 }, { agent: '', interactions: 1 }]);
    const a = out.agents.find(r => r.agent === 'a')!;
    expect(a).toMatchObject({ sessions: 10, recorded: 6, escalated: 1, interactions: 20, interactionsPerSession: 2 });
    expect(out.agents.find(r => r.agent === 'b')).toMatchObject({ sessions: 0, escalated: null, interactionsPerSession: null });
    expect(out.daily.filter(d => d.agent === 'a')).toEqual([{ agent: 'a', day: '2026-01-01', sessions: 5 }, { agent: 'a', day: '2026-01-02', sessions: 5 }]);
    expect(out.truncated).toBe(false);
  });
  it('flags truncation', () => {
    const many = Array.from({ length: ANALYTICS_LIMITS.groups + 1 }, (_, i) => ({ agent: `a${i % 3}`, day: '2026-01-01', end_type: 'X', sessions: 1 }));
    expect(aggregateAnalytics(many, []).truncated).toBe(true);
    expect(aggregateAnalytics([], Array.from({ length: ANALYTICS_LIMITS.agents + 1 }, (_, i) => ({ agent: `a${i}`, interactions: 1 }))).truncated).toBe(true);
    const agents = Array.from({ length: ANALYTICS_LIMITS.rows + 1 }, (_, i) => ({ agent: `a${i}`, day: '2026-01-01', end_type: 'X', sessions: 1 }));
    const r = aggregateAnalytics(agents, []);
    expect(r.agents).toHaveLength(ANALYTICS_LIMITS.rows);
    expect(r.truncated).toBe(true);
  });
  it('classifies failures', () => {
    expect(classifyFailure(404, '').reason).toBe('no_session_tables');
    expect(classifyFailure(400, 'Table ssot__AiAgentSession__dlm not found').reason).toBe('no_session_tables');
    expect(classifyFailure(403, '').reason).toBe('no_data_360');
    expect(classifyFailure(500, 'boom').reason).toBe('query_failed');
  });
});

function setup(opts: { approved?: boolean; ttl?: number } = {}) {
  const handlers = new Map<string, (args: unknown) => Promise<any>>();
  let now = Date.parse('2026-11-10T12:00:00Z');
  const request = vi.fn();
  const sdk = {
    connect: vi.fn(async () => org),
    confirm: vi.fn(async () => opts.approved === false ? { approved: false, reason: 'denied' } : { approved: true, reason: 'submitted' }),
    request,
  };
  const studio: any = { deps: { now: () => now }, registerRpc: (n: string, h: any) => handlers.set(n, h) };
  registerOrgAnalytics(studio, { sdkFor: () => sdk as never, cacheTtlMs: opts.ttl });
  return { call: (args: unknown = {}) => handlers.get(ORG_ANALYTICS_RPC.overview)!(args), request, sdk, tick: (ms: number) => { now += ms; } };
}
const answer = (status: number, json: unknown, text = '') => ({ org, response: { status, json, text } });
const happy = (request: any) => request.mockImplementation(async (_p: string, init: any) => String(init.body.sql).includes('AiAgentInteraction')
  ? answer(200, { metadata: [{ name: 'agent' }, { name: 'interactions' }], data: [['a', 6]] })
  : answer(200, { metadata: [{ name: 'agent' }, { name: 'day' }, { name: 'end_type' }, { name: 'sessions' }], data: [['a', '2026-11-09', 'Escalated', 1], ['a', '2026-11-09', 'Completed', 2]] }));

describe('analytics rpc', () => {
  it('returns a ready overview from two read-only queries and caches it', async () => {
    const t = setup(); happy(t.request);
    const r = await t.call({ period: '24h' });
    expect(r).toMatchObject({ ok: true, state: 'ready', org: 'dev', period: '24h', totals: { sessions: 3, interactions: 6, agents: 1 }, truncated: false });
    expect(r.escalation.rate).toBeCloseTo(1 / 3);
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(t.request.mock.calls[0][0]).toBe(QUERY_SQL_PATH);
    expect(t.request.mock.calls[0][1]).toMatchObject({ method: 'POST', apiVersion: '68.0', alias: 'dev' });
    expect(await t.call({ period: '24h' })).toBe(r);
    expect(t.request).toHaveBeenCalledTimes(2);
    await t.call({ period: '24h', refresh: true });
    expect(t.request).toHaveBeenCalledTimes(4);
    t.tick(61_000);
    await t.call({ period: '24h' });
    expect(t.request).toHaveBeenCalledTimes(6);
  });
  it('reports not-recorded outcomes as null, never zero', async () => {
    const t = setup();
    t.request.mockImplementation(async (_p: string, init: any) => String(init.body.sql).includes('AiAgentInteraction')
      ? answer(200, { metadata: [], data: [] })
      : answer(200, { metadata: [{ name: 'agent' }, { name: 'day' }, { name: 'end_type' }, { name: 'sessions' }], data: [['a', '2026-11-09', 'NOT_SET', 4]] }));
    const r = await t.call({ period: 'bogus' });
    expect(r.period).toBe('7d');
    expect(r.escalation).toBeNull();
    expect(r.agents[0]).toMatchObject({ sessions: 4, recorded: 0, escalated: null });
  });
  it('answers unavailable when Data 360 refuses', async () => {
    const t = setup();
    t.request.mockImplementation(async () => answer(403, { message: 'not enabled' }));
    expect(await t.call()).toMatchObject({ ok: true, state: 'unavailable', reason: 'no_data_360' });
  });
  it('refuses when the operator denies', async () => {
    const t = setup({ approved: false });
    expect(await t.call()).toMatchObject({ ok: false, code: 'refused' });
    expect(t.request).not.toHaveBeenCalled();
  });
  it('fails closed on thrown errors', async () => {
    const t = setup();
    t.request.mockRejectedValue(new Error('network down'));
    expect(await t.call()).toMatchObject({ ok: false, code: 'failed', error: 'network down' });
    t.sdk.connect.mockRejectedValueOnce('plain');
    expect(await t.call()).toMatchObject({ ok: false, code: 'failed' });
  });
  it('bounds the cache', async () => {
    const t = setup(); happy(t.request);
    for (const p of ['24h', '7d', '30d']) await t.call({ period: p });
    expect(t.request).toHaveBeenCalledTimes(6);
  });
});

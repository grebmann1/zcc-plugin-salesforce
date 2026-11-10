import {
  ANALYTICS_LIMITS, ORG_ANALYTICS_RPC, analyticsPeriodHours, isEscalatedEndType, isRecordedEndType, parseAnalyticsPeriod, summarizeEscalation,
  type AnalyticsAgentRow, type AnalyticsDay, type AnalyticsPeriod, type AnalyticsUnavailableReason, type OrgAnalyticsOverview,
} from './org-analytics-contract.js';
import { compactError } from './dx-project.js';
import { rpcFailure, rpcString, type StudioServerContext } from './studio-server-context.js';
import type { SalesforceSdk } from './sdk-contract.js';

export interface OrgAnalyticsDeps {
  /** The sdk for this call: Studio read grants applied (a production org without a grant answers `refused`). */
  sdkFor(args: unknown): SalesforceSdk;
  cacheTtlMs?: number;
}

/** Data 360 SQL endpoint; the dataspace is fixed because the session tables live in `default`. */
export const QUERY_SQL_PATH = '/ssot/query-sql?dataspaceName=default';
export const ANALYTICS_API_VERSION = '68.0';
const CACHE_TTL_MS = 60_000;
const CACHE_ENTRIES = 24;

const SESSION = '"ssot__AiAgentSession__dlm"';
const PARTICIPANT = '"ssot__AiAgentSessionParticipant__dlm"';
const INTERACTION = '"ssot__AiAgentInteraction__dlm"';

const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '').slice(0, max);
const count = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** The start of the window; derived from the clock, never from user text. */
export function windowStart(period: AnalyticsPeriod, now: number): Date {
  return new Date(now - analyticsPeriodHours(period) * 3_600_000);
}
/** `YYYY-MM-DD HH:MM:SS` in UTC, the literal form the SQL TIMESTAMP accepts. */
export function sqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

const WHERE = (since: string) => `s.ssot__StartTimestamp__c >= TIMESTAMP '${since}' AND p.ssot__AiAgentApiName__c <> 'NOT_SET'`;
/** Sessions per agent, UTC day and end type. One row more than the bound is requested so a cut-off answer can be flagged. */
export function sessionsSql(since: string): string {
  return `SELECT p.ssot__AiAgentApiName__c AS agent, CAST(s.ssot__StartTimestamp__c AS DATE) AS day, s.ssot__AiAgentSessionEndType__c AS end_type, COUNT(DISTINCT s.ssot__Id__c) AS sessions FROM ${SESSION} s JOIN ${PARTICIPANT} p ON p.ssot__AiAgentSessionId__c = s.ssot__Id__c WHERE ${WHERE(since)} GROUP BY p.ssot__AiAgentApiName__c, CAST(s.ssot__StartTimestamp__c AS DATE), s.ssot__AiAgentSessionEndType__c ORDER BY day DESC LIMIT ${ANALYTICS_LIMITS.groups + 1}`;
}
/** Interactions per agent over the same sessions. */
export function interactionsSql(since: string): string {
  return `SELECT p.ssot__AiAgentApiName__c AS agent, COUNT(DISTINCT i.ssot__Id__c) AS interactions FROM ${SESSION} s JOIN ${PARTICIPANT} p ON p.ssot__AiAgentSessionId__c = s.ssot__Id__c JOIN ${INTERACTION} i ON i.ssot__AiAgentSessionId__c = s.ssot__Id__c WHERE ${WHERE(since)} GROUP BY p.ssot__AiAgentApiName__c ORDER BY interactions DESC LIMIT ${ANALYTICS_LIMITS.agents + 1}`;
}

/** Rows of a query-sql answer as objects keyed by column name. Unknown shapes yield no rows. */
export function sqlRows(json: unknown): Array<Record<string, unknown>> {
  const body = rec(json);
  const data = Array.isArray(body.data) ? body.data : [];
  const columns = Array.isArray(body.metadata) ? body.metadata.map(column => clip(rec(column).name, 80)) : [];
  if (!columns.length) return [];
  return data.filter(Array.isArray).map(row => Object.fromEntries(columns.map((name, index) => [name, (row as unknown[])[index]])));
}

/** Folds the two result sets into per-agent rows and the per-agent daily series. Pure. */
export function aggregateAnalytics(sessionRows: Array<Record<string, unknown>>, interactionRows: Array<Record<string, unknown>>) {
  const agents = new Map<string, { sessions: number; recorded: number; escalated: number }>();
  const daily: AnalyticsDay[] = [];
  let truncated = false;
  let groups = sessionRows;
  if (groups.length > ANALYTICS_LIMITS.groups) { truncated = true; groups = groups.slice(0, ANALYTICS_LIMITS.groups); }
  for (const row of groups) {
    const agent = clip(row.agent, ANALYTICS_LIMITS.name);
    if (!agent) continue;
    const sessions = count(row.sessions);
    const endType = typeof row.end_type === 'string' ? row.end_type : '';
    const entry = agents.get(agent) ?? { sessions: 0, recorded: 0, escalated: 0 };
    entry.sessions += sessions;
    if (isRecordedEndType(endType)) {
      entry.recorded += sessions;
      if (isEscalatedEndType(endType)) entry.escalated += sessions;
    }
    agents.set(agent, entry);
    const day = clip(row.day, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const existing = daily.find(item => item.agent === agent && item.day === day);
      if (existing) existing.sessions += sessions; else daily.push({ agent, day, sessions });
    }
  }
  const interactions = new Map<string, number>();
  let interactionRowsRead = interactionRows;
  if (interactionRowsRead.length > ANALYTICS_LIMITS.agents) { truncated = true; interactionRowsRead = interactionRowsRead.slice(0, ANALYTICS_LIMITS.agents); }
  for (const row of interactionRowsRead) {
    const agent = clip(row.agent, ANALYTICS_LIMITS.name);
    if (agent) interactions.set(agent, (interactions.get(agent) ?? 0) + count(row.interactions));
  }
  let rows: AnalyticsAgentRow[] = [...agents].map(([agent, entry]) => {
    const total = interactions.get(agent) ?? 0;
    return {
      agent,
      sessions: entry.sessions,
      interactions: total,
      interactionsPerSession: entry.sessions > 0 ? total / entry.sessions : null,
      recorded: entry.recorded,
      escalated: entry.recorded > 0 ? entry.escalated : null,
    };
  }).sort((a, b) => b.sessions - a.sessions || a.agent.localeCompare(b.agent));
  if (rows.length > ANALYTICS_LIMITS.rows) { rows = rows.slice(0, ANALYTICS_LIMITS.rows); truncated = true; }
  const kept = new Set(rows.map(row => row.agent));
  return { agents: rows, daily: daily.filter(item => kept.has(item.agent)).sort((a, b) => a.day.localeCompare(b.day) || a.agent.localeCompare(b.agent)), truncated };
}

/** Maps a failed query to a stable reason; messages stay generic so no org text is echoed as guidance. */
export function classifyFailure(status: number, text: string): { reason: AnalyticsUnavailableReason; message: string } {
  const lower = text.toLowerCase();
  if (status === 404 || /ssot__aiagent|table .* not found|does not exist|unknown table|no such table/.test(lower)) {
    return { reason: 'no_session_tables', message: 'This org has no Agentforce session tracing tables in Data 360, so session analytics are unavailable.' };
  }
  if (status === 403 || status === 401 || /not enabled|feature|permission|insufficient/.test(lower)) {
    return { reason: 'no_data_360', message: 'Data 360 is not enabled for this org or user, so session analytics are unavailable.' };
  }
  return { reason: 'query_failed', message: 'Session analytics could not be read from Data 360.' };
}

export function registerOrgAnalytics(studio: StudioServerContext, deps: OrgAnalyticsDeps): void {
  const ttl = deps.cacheTtlMs ?? CACHE_TTL_MS;
  const cache = new Map<string, { at: number; value: OrgAnalyticsOverview }>();
  const remember = (key: string, value: OrgAnalyticsOverview) => {
    cache.delete(key);
    cache.set(key, { at: studio.deps.now(), value });
    while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  };

  studio.registerRpc(ORG_ANALYTICS_RPC.overview, async (args: unknown) => {
    const period = parseAnalyticsPeriod(rec(args).period);
    try {
      const sdk = deps.sdkFor(args);
      const org = await sdk.connect();
      const mediated = await sdk.confirm({ orgAlias: org.alias, orgId: org.orgId, orgKind: org.kind, summary: `analytics.overview on ${org.alias} (${org.kind})` }, rpcString(args, 'threadId'));
      if (!mediated.approved) return rpcFailure('refused', `Operator ${mediated.reason} analytics.overview.`);
      const key = `${org.orgId || org.alias}\n${period}`;
      const cached = cache.get(key);
      if (cached && !rec(args).refresh && studio.deps.now() - cached.at < ttl) return cached.value;

      const startDate = windowStart(period, studio.deps.now());
      const since = sqlTimestamp(startDate);
      const run = (sql: string) => sdk.request(QUERY_SQL_PATH, { method: 'POST', body: { sql }, apiVersion: ANALYTICS_API_VERSION, alias: org.alias });
      const [sessions, interactions] = await Promise.all([run(sessionsSql(since)), run(interactionsSql(since))]);
      const failed = [sessions, interactions].find(result => result.response.status >= 400);
      if (failed) {
        const unavailable = classifyFailure(failed.response.status, compactError(failed.response.status, failed.response.json, failed.response.text));
        const value: OrgAnalyticsOverview = { ok: true, state: 'unavailable', period, ...unavailable };
        remember(key, value);
        return value;
      }
      const aggregated = aggregateAnalytics(sqlRows(sessions.response.json), sqlRows(interactions.response.json));
      const value: OrgAnalyticsOverview = {
        ok: true,
        state: 'ready',
        org: org.alias,
        period,
        since: startDate.toISOString(),
        at: new Date(studio.deps.now()).toISOString(),
        agents: aggregated.agents,
        daily: aggregated.daily,
        totals: {
          sessions: aggregated.agents.reduce((sum, row) => sum + row.sessions, 0),
          interactions: aggregated.agents.reduce((sum, row) => sum + row.interactions, 0),
          agentsWithData: aggregated.agents.filter(row => row.sessions > 0).length,
          agents: aggregated.agents.length,
        },
        escalation: summarizeEscalation(aggregated.agents),
        truncated: aggregated.truncated,
      };
      remember(key, value);
      return value;
    } catch (error) {
      return rpcFailure('failed', error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400));
    }
  });
}

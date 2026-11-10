/**
 * Fleet analytics: Agentforce session counts, interactions and outcomes read from Data 360 session tracing (STDM).
 * Isomorphic: imported by the server (lib/org-analytics.ts) and the Studio (src/app/studio/*). No node imports.
 *
 * Sessions are keyed by agent API name only: the session tables carry no version or environment, so neither is
 * offered as a filter. An outcome is "recorded" only when the org stored an end type other than NOT_SET; otherwise
 * the figure is reported as not recorded, never as zero.
 */

export const ORG_ANALYTICS_RPC = {
  /** {period?: '24h'|'7d'|'30d', refresh?} -> OrgAnalyticsOverview. Read-only; one bounded SQL pair per call. */
  overview: 'studio.analytics.overview',
} as const;

export const ANALYTICS_PERIODS = ['24h', '7d', '30d'] as const;
export type AnalyticsPeriod = typeof ANALYTICS_PERIODS[number];
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = '7d';

export const ANALYTICS_LIMITS = {
  /** Rows of the (agent, day, end type) grouping; a truncated answer says so. */
  groups: 5000,
  /** Agents counted for interactions. */
  agents: 500,
  /** Agents returned to the Studio. */
  rows: 200,
  name: 200,
} as const;

export const analyticsPeriodHours = (period: AnalyticsPeriod): number => period === '24h' ? 24 : period === '7d' ? 168 : 720;
export function parseAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  return ANALYTICS_PERIODS.find(period => period === value) ?? DEFAULT_ANALYTICS_PERIOD;
}

/** One agent over the window. `escalated` is null when no session of this agent recorded an end type. */
export interface AnalyticsAgentRow {
  agent: string;
  sessions: number;
  interactions: number;
  /** interactions / sessions, null with no sessions or no interaction records. */
  interactionsPerSession: number | null;
  /** Sessions with a recorded end type (anything but NOT_SET). */
  recorded: number;
  escalated: number | null;
}

/** Sessions one agent started on one UTC day. */
export interface AnalyticsDay { agent: string; day: string; sessions: number }

/**
 * Session-weighted escalation: escalated sessions over sessions with a recorded outcome, across agents.
 * `averageOfRates` is the unweighted mean of per-agent rates, kept only so the two are never confused.
 */
export interface AnalyticsEscalation {
  escalated: number;
  recorded: number;
  rate: number;
  averageOfRates: number | null;
}

export type AnalyticsUnavailableReason = 'no_data_360' | 'no_session_tables' | 'query_failed' | 'no_org';

export interface AnalyticsOverviewReady {
  ok: true;
  state: 'ready';
  org: string;
  period: AnalyticsPeriod;
  /** ISO start of the window; sessions started at or after it are counted. */
  since: string;
  at: string;
  agents: AnalyticsAgentRow[];
  daily: AnalyticsDay[];
  totals: { sessions: number; interactions: number; agentsWithData: number; agents: number };
  /** null while no session in the window recorded an outcome. */
  escalation: AnalyticsEscalation | null;
  /** True when a bound cut the answer short; the figures cover only what was read. */
  truncated: boolean;
}
export interface AnalyticsOverviewUnavailable {
  ok: true;
  state: 'unavailable';
  reason: AnalyticsUnavailableReason;
  message: string;
  period: AnalyticsPeriod;
}
export type OrgAnalyticsOverview = AnalyticsOverviewReady | AnalyticsOverviewUnavailable;

/** A case-insensitive test for the end types that mean the agent handed off to a person. */
export const isEscalatedEndType = (endType: string): boolean => /escalat|transfer|handoff|hand_off/i.test(endType);
export const isRecordedEndType = (endType: string | null | undefined): boolean => {
  const value = (endType ?? '').trim();
  return value !== '' && value.toUpperCase() !== 'NOT_SET';
};

export interface AnalyticsSummary {
  agents: AnalyticsAgentRow[];
  /** Sessions per day across the selected agents, ascending, gaps filled with 0. */
  daily: Array<{ day: string; sessions: number }>;
  totals: { sessions: number; interactions: number; agentsWithData: number; agents: number };
  escalation: AnalyticsEscalation | null;
}

/** Escalation across rows, weighted by sessions that recorded an outcome; null when none did. */
export function summarizeEscalation(rows: readonly AnalyticsAgentRow[]): AnalyticsEscalation | null {
  const withOutcome = rows.filter(row => row.recorded > 0 && row.escalated !== null);
  const recorded = withOutcome.reduce((sum, row) => sum + row.recorded, 0);
  if (recorded === 0) return null;
  const escalated = withOutcome.reduce((sum, row) => sum + (row.escalated ?? 0), 0);
  const rates = withOutcome.map(row => (row.escalated ?? 0) / row.recorded);
  return { escalated, recorded, rate: escalated / recorded, averageOfRates: rates.reduce((a, b) => a + b, 0) / rates.length };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Every figure of the view for one agent selection ('all' or an agent name), so KPIs, trend and table share one population. */
export function summarizeAnalytics(overview: AnalyticsOverviewReady, agent: string = 'all'): AnalyticsSummary {
  const agents = agent === 'all' ? overview.agents : overview.agents.filter(row => row.agent === agent);
  const selected = new Set(agents.map(row => row.agent));
  const perDay = new Map<string, number>();
  for (const entry of overview.daily) {
    if (!selected.has(entry.agent) || !DAY.test(entry.day)) continue;
    perDay.set(entry.day, (perDay.get(entry.day) ?? 0) + entry.sessions);
  }
  const days = [...perDay.keys()].sort();
  const daily: Array<{ day: string; sessions: number }> = [];
  if (days.length) {
    const end = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
    for (let at = Date.parse(`${days[0]}T00:00:00Z`); at <= end && daily.length < 400; at += 86_400_000) {
      const day = new Date(at).toISOString().slice(0, 10);
      daily.push({ day, sessions: perDay.get(day) ?? 0 });
    }
  }
  return {
    agents,
    daily,
    totals: {
      sessions: agents.reduce((sum, row) => sum + row.sessions, 0),
      interactions: agents.reduce((sum, row) => sum + row.interactions, 0),
      agentsWithData: agents.filter(row => row.sessions > 0).length,
      agents: agents.length,
    },
    escalation: summarizeEscalation(agents),
  };
}

/**
 * Adds a no-session row for every inventory agent the sessions did not mention, so an agent without data is stated rather
 * than omitted. Names match case-insensitively; sessions of agents outside the inventory stay listed.
 */
export function mergeInventory(agents: readonly AnalyticsAgentRow[], names: readonly string[]): AnalyticsAgentRow[] {
  const seen = new Set(agents.map(row => row.agent.toLowerCase()));
  const missing: AnalyticsAgentRow[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    missing.push({ agent: name, sessions: 0, interactions: 0, interactionsPerSession: null, recorded: 0, escalated: null });
  }
  return [...agents, ...missing.sort((a, b) => a.agent.localeCompare(b.agent))];
}

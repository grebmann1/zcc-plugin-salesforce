import { orgMetricLabel, type OrgMetricResult, type OrgRunResults } from '../../../lib/org-tests-contract.js';

/**
 * Scorers are the metrics a Testing Center run reports per case (topic match, action sequence, response quality...).
 * A rate exists only for pass/fail metrics; scored-only metrics report an average score and no rate. Nothing is guessed:
 * a scorer no case produced is absent, and a scorer without a decided case has a null rate.
 */
export interface ScorerRow {
  name: string;
  label: string;
  cases: number;
  pass: number;
  fail: number;
  /** Metrics the org could not compute. */
  errors: number;
  /** pass / (pass + fail); null when no case was decided. */
  rate: number | null;
  /** Mean of the reported scores; null when none was reported. */
  averageScore: number | null;
}

const decided = (metric: OrgMetricResult) => metric.result === 'pass' || metric.result === 'fail';

/** One row per scorer across the cases of one run, in the order scorers first appear. */
export function scorerRows(run: Pick<OrgRunResults, 'cases'>): ScorerRow[] {
  const rows = new Map<string, ScorerRow & { scoreSum: number; scored: number }>();
  for (const testCase of run.cases) {
    for (const metric of testCase.metrics) {
      const row = rows.get(metric.name) ?? { name: metric.name, label: orgMetricLabel(metric.name), cases: 0, pass: 0, fail: 0, errors: 0, rate: null, averageScore: null, scoreSum: 0, scored: 0 };
      row.cases++;
      if (metric.error) row.errors++;
      else if (metric.result === 'pass') row.pass++;
      else if (metric.result === 'fail') row.fail++;
      if (!metric.error && typeof metric.score === 'number' && Number.isFinite(metric.score)) { row.scoreSum += metric.score; row.scored++; }
      rows.set(metric.name, row);
    }
  }
  return [...rows.values()].map(({ scoreSum, scored, ...row }) => ({
    ...row,
    rate: row.pass + row.fail > 0 ? row.pass / (row.pass + row.fail) : null,
    averageScore: scored > 0 ? scoreSum / scored : null,
  }));
}

export interface ScorerTrendPoint { runId: string; startedAt: number; rate: number | null; averageScore: number | null }
export interface ScorerTrend { name: string; label: string; points: ScorerTrendPoint[]; /** Rate change from the previous run with a rate to the latest, in points of 1; null with fewer than two. */ delta: number | null }

/** Scorer history over completed runs, oldest first. A run without that scorer yields a point with null figures. */
export function scorerTrends(runs: readonly OrgRunResults[]): ScorerTrend[] {
  const ordered = runs.filter(run => run.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  const names = new Map<string, string>();
  const perRun = ordered.map(run => {
    const rows = scorerRows(run);
    for (const row of rows) if (!names.has(row.name)) names.set(row.name, row.label);
    return new Map(rows.map(row => [row.name, row]));
  });
  return [...names].map(([name, label]) => {
    const points = ordered.map((run, index) => {
      const row = perRun[index]!.get(name);
      return { runId: run.runId, startedAt: run.startedAt, rate: row?.rate ?? null, averageScore: row?.averageScore ?? null };
    });
    const withRate = points.filter(point => point.rate !== null);
    const delta = withRate.length >= 2 ? withRate[withRate.length - 1]!.rate! - withRate[withRate.length - 2]!.rate! : null;
    return { name, label, points, delta };
  });
}

/** Cases that failed a given scorer, for drill-through. */
export function failingCases(run: Pick<OrgRunResults, 'cases'>, name: string) {
  return run.cases.filter(testCase => testCase.metrics.some(metric => metric.name === name && decided(metric) && metric.result === 'fail'));
}

export const percent = (value: number | null): string => value === null ? 'Not scored' : `${Math.round(value * 100)}%`;

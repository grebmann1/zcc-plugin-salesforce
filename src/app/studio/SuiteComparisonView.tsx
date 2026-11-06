import type { ScenarioCase, SuiteComparison } from '../../../lib/studio-contract.js';
import { SUITE_COMPARISON_STYLES } from './suite-comparison-styles.js';

export function comparisonSummary(comparison: SuiteComparison) {
  let improved = 0, regressed = 0, unclear = 0, referencePass = 0, candidatePass = 0;
  const ids = Object.keys(comparison.reference);
  for (const id of ids) {
    const a = comparison.reference[id]?.outcome, b = comparison.candidate[id]?.outcome;
    if (a === 'pass') referencePass++;
    if (b === 'pass') candidatePass++;
    if (!a || !b || a === 'inconclusive' || b === 'inconclusive') unclear++;
    else if (a === 'fail' && b === 'pass') improved++;
    else if (a === 'pass' && b === 'fail') regressed++;
  }
  return { total: ids.length, improved, regressed, unclear, referencePass, candidatePass };
}

/** Read-only snapshots. Comparing must never save a draft or replace the suite's normal results. */
export function SuiteComparisonView({ comparison, cases, stale }: { comparison: SuiteComparison; cases: ScenarioCase[]; stale: boolean }) {
  const counts = comparisonSummary(comparison);
  return <section aria-label="Saved source versus editor draft" className="sf-comparison">
    <style>{SUITE_COMPARISON_STYLES}</style>
    <h3>Saved source → Editor draft</h3>
    <p className="sf-comparison-subtitle">The same {counts.total} case{counts.total === 1 ? '' : 's'}, compared in Simulate.</p>
    {comparison.referenceHash === comparison.candidateHash && <p className="sf-comparison-note">Both sources are identical. This run checks variation between repeated conversations.</p>}
    {stale && <div className="sf-comparison-stale" role="status">The editor or cases changed after this comparison. Run it again to compare the current draft.</div>}
    <div className="sf-comparison-metrics" aria-label={`Saved source → Editor draft: ${counts.referencePass}/${counts.total} → ${counts.candidatePass}/${counts.total} pass`}>
      <div className="sf-comparison-metric"><span>Saved source</span><strong>{counts.referencePass} / {counts.total}</strong><small>cases passed</small></div>
      <div className="sf-comparison-metric"><span>Editor draft</span><strong>{counts.candidatePass} / {counts.total}</strong><small>cases passed</small></div>
    </div>
    <div className="sf-comparison-delta" role="status" aria-label={`${counts.improved} improved · ${counts.regressed} regressed · ${counts.unclear} unclear`}>
      <span>{counts.improved} improved</span><span>{counts.regressed} regressed</span><span>{counts.unclear} unclear</span>
    </div>
    {Object.keys(comparison.reference).map(id => {
      const name = cases.find(c => c.id === id)?.name ?? id;
      const reference = comparison.reference[id]?.outcome ?? 'inconclusive';
      const candidate = comparison.candidate[id]?.outcome ?? 'inconclusive';
      return <details key={id} className="sf-comparison-case">
        <summary aria-label={`${name}: ${reference} → ${candidate}`}><strong>{name}</strong><span className="sf-comparison-outcomes"><span className="sf-comparison-outcome" data-outcome={reference}>{reference}</span><span aria-hidden="true">→</span><span className="sf-comparison-outcome" data-outcome={candidate}>{candidate}</span></span></summary>
        <div className="sf-comparison-replies">
          {(['reference', 'candidate'] as const).map(side => {
            const result = comparison[side][id];
            return <div key={side} className="sf-comparison-side"><h4>{side === 'reference' ? 'Saved source' : 'Editor draft'}</h4>
              <p className="sf-comparison-reply">{result?.reply ?? 'No reply recorded'}</p>
              <dl className="sf-comparison-facts"><div><dt>Actions</dt><dd>{result?.observed?.actions.join(', ') || 'None recorded'}</dd></div><div><dt>Maximum response latency</dt><dd>{result?.latencyMs !== undefined ? `${result.latencyMs} ms` : 'Unavailable'}</dd></div></dl>
              {result?.notes?.map((note, i) => <p className="sf-comparison-note" key={i}>{note}</p>)}
            </div>;
          })}
        </div>
      </details>;
    })}
    <details className="sf-comparison-about"><summary>About this comparison</summary>
      <p>Same scripted messages and context, in Simulate. Actions are simulated. Each reply is generated afresh; one run does not establish statistical improvement.</p>
      <small>Reference {comparison.referenceHash.slice(0, 12)} · Candidate {comparison.candidateHash.slice(0, 12)}</small>
    </details>
  </section>;
}

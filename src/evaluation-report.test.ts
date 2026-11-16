import { expect, it } from 'vitest';
import { evaluationReportParts } from '../lib/evaluation-report.js';

it('keeps small exports compatible and partitions a realistic suite without dropping evidence', () => {
  expect(evaluationReportParts([])).toEqual([{ name: 'Evaluation results.json', content: '[]' }]);
  const rows = Array.from({ length: 27 }, (_, caseId) => ({ caseId, sourceHash: 'pinned', result: { outcome: 'inconclusive', conversation: 'Full transcript!\n'.repeat(650) } }));
  const parts = evaluationReportParts(rows);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.every(part => part.content.length <= 50_000)).toBe(true);
  expect(parts[0].name).toBe(`Evaluation results 1 of ${parts.length}.json`);
  expect(parts.flatMap(part => JSON.parse(part.content))).toEqual(rows);
});
it('never silently clips a single oversized result', () => {
  expect(() => evaluationReportParts([{ transcript: 'x'.repeat(50_000) }])).toThrow('Download evaluation report');
});

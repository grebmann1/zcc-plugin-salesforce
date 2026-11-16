import { BUILDER_LIMITS } from './studio-builder-contract.js';

/** Each part is a complete JSON array; no case or transcript is silently clipped. */
export function evaluationReportParts(rows: readonly unknown[]): Array<{ name: string; content: string }> {
  const groups: string[] = [];
  let group: unknown[] = [];
  for (const row of rows) {
    if (JSON.stringify([row], null, 2).length > BUILDER_LIMITS.content) throw Error('A result exceeds the workspace file limit. Use Download evaluation report to keep its complete evidence.');
    if (JSON.stringify([...group, row], null, 2).length > BUILDER_LIMITS.content) {
      groups.push(JSON.stringify(group, null, 2)); group = [];
    }
    group.push(row);
  }
  if (group.length || !groups.length) groups.push(JSON.stringify(group, null, 2));
  return groups.map((content, index) => ({ name: groups.length === 1 ? 'Evaluation results.json' : `Evaluation results ${index + 1} of ${groups.length}.json`, content }));
}

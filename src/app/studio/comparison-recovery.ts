/** Persist only owned job handles, never source, transcripts, or setup confirmations. */
export interface ComparisonHandle { jobId: string; suiteId: string; suitePath: string; at: number }
const PREFIX = 'salesforce:comparison-handle:v1:';
const MAX_AGE = 86_400_000;
function parse(raw: string | null): ComparisonHandle | null {
  if (!raw || raw.length > 6000) return null;
  const row = JSON.parse(raw) as ComparisonHandle;
  return row && typeof row.jobId === 'string' && /^[\w.-]{1,100}$/.test(row.jobId)
    && typeof row.suiteId === 'string' && row.suiteId.length <= 120
    && typeof row.suitePath === 'string' && row.suitePath.length <= 4096
    && Number.isFinite(row.at) && row.at <= Date.now() && Date.now() - row.at < MAX_AGE
    ? { jobId: row.jobId, suiteId: row.suiteId, suitePath: row.suitePath, at: row.at } : null;
}
export function readComparisonHandle(key: string): ComparisonHandle | null {
  try { return parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}
export function writeComparisonHandle(key: string, handle: ComparisonHandle) {
  try {
    const rows: Array<{ key: string; at: number }> = [];
    for (let index = 0; index < localStorage.length; index++) {
      const storedKey = localStorage.key(index);
      if (!storedKey?.startsWith(PREFIX)) continue;
      let value: ComparisonHandle | null = null;
      try { value = parse(localStorage.getItem(storedKey)); } catch { /* prune malformed entries */ }
      rows.push({ key: storedKey, at: value?.at ?? 0 });
    }
    for (const row of rows.filter(row => !row.at)) localStorage.removeItem(row.key);
    const valid = rows.filter(row => row.at && row.key !== PREFIX + key).sort((a, b) => b.at - a.at);
    for (const row of valid.slice(31)) localStorage.removeItem(row.key);
    localStorage.setItem(PREFIX + key, JSON.stringify({ jobId: handle.jobId, suiteId: handle.suiteId, suitePath: handle.suitePath, at: handle.at }));
  } catch { /* Optional recovery storage must not interrupt a run. */ }
}
export function forgetComparisonHandle(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* Optional storage. */ }
}

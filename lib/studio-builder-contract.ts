import type { CaseResult } from './studio-contract.js';
/** Builder workspace resources. No executable manifests or remote tool code. */
export const BUILDER_RPC = { get: 'studio.builder.get', save: 'studio.builder.save' } as const;
export const BUILDER_TOOLS = ['evals', 'sessions', 'analytics', 'issues', 'scorers', 'experiments', 'compare', 'artifacts', 'settings', 'import'] as const;
export type BuilderTool = typeof BUILDER_TOOLS[number];
export const isBuilderTool = (value: unknown): value is BuilderTool => BUILDER_TOOLS.includes(value as BuilderTool);
export interface BuilderScorer { id: string; name: string; kind: 'contains' | 'excludes' | 'latency'; value: string }
export interface BuilderArtifact { id: string; name: string; content: string }
export interface BuilderShortcut { id: string; name: string; description: string; tool: BuilderTool }
export interface BuilderResources { revision: number; scorers: BuilderScorer[]; artifacts: BuilderArtifact[]; shortcuts: BuilderShortcut[] }
export const emptyBuilderResources = (): BuilderResources => ({ revision: 0, scorers: [], artifacts: [], shortcuts: [] });
export const BUILDER_LIMITS = { scorers: 50, artifacts: 30, shortcuts: 20, content: 50_000, bytes: 750_000 } as const;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0');
const identity = (row: Record<string, unknown>) => text(row.id, 80) && /^[A-Za-z0-9_-]+$/.test(row.id) && text(row.name, 120);
/** Whitelist every field and bound the entire payload before writing project storage. */
export function parseBuilderResources(value: unknown, options?: { migrateRetiredTools?: boolean }): BuilderResources {
  if (!record(value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw Error('Invalid workspace revision.');
  if (JSON.stringify(value).length > BUILDER_LIMITS.bytes) throw Error('Workspace resources exceed the storage limit.');
  const rows = (key: 'scorers' | 'artifacts' | 'shortcuts') => {
    const items = value[key];
    if (!Array.isArray(items) || items.length > BUILDER_LIMITS[key] || items.some(row => !record(row) || !identity(row))) throw Error(`Invalid ${key}.`);
    if (new Set(items.map(row => row.id)).size !== items.length) throw Error(`Duplicate ${key} identifiers.`);
    return items as Record<string, unknown>[];
  };
  const scorers = rows('scorers').map(row => {
    if (!['contains', 'excludes', 'latency'].includes(String(row.kind)) || !text(row.value, 2000)) throw Error('Invalid scorer rule.');
    if (row.kind === 'latency' && (!Number.isFinite(Number(row.value)) || Number(row.value) <= 0 || Number(row.value) > 600_000)) throw Error('Latency must be between 1 and 600000 ms.');
    return { id: row.id as string, name: (row.name as string).trim(), kind: row.kind as BuilderScorer['kind'], value: (row.value as string).trim() };
  });
  const artifacts = rows('artifacts').map(row => {
    if (typeof row.content !== 'string' || row.content.length > BUILDER_LIMITS.content) throw Error('File content exceeds 50000 characters.');
    return { id: row.id as string, name: (row.name as string).trim(), content: row.content };
  });
  const shortcuts = rows('shortcuts').flatMap(row => {
    // Earlier previews offered a duplicate console. Retire only its stored
    // shortcuts; preserve the revision and every other workspace resource.
    if (options?.migrateRetiredTools && row.tool === 'terminal') return [];
    if (!isBuilderTool(row.tool) || row.tool === 'import' || typeof row.description !== 'string' || row.description.length > 500) throw Error('Choose a supported tool for this shortcut.');
    return [{ id: row.id as string, name: (row.name as string).trim(), description: row.description, tool: row.tool }];
  });
  return { revision: Number(value.revision), scorers, artifacts, shortcuts };
}
export function parseToolManifest(value: unknown): Omit<BuilderShortcut, 'id'> {
  if (!record(value)) throw Error('Choose a JSON tool manifest.');
  const checked = parseBuilderResources({ ...emptyBuilderResources(), shortcuts: [{ ...value, id: 'manifest' }] }).shortcuts[0];
  return { name: checked.name, description: checked.description, tool: checked.tool };
}
export function scoreEvidence(rule: BuilderScorer, evidence: Pick<CaseResult, 'reply' | 'replyTruncated' | 'conversation' | 'conversationTruncated' | 'latencyMs' | 'stopped' | 'setupBlocked'>): 'pass' | 'fail' | 'inconclusive' {
  if (evidence.stopped || evidence.setupBlocked) return 'inconclusive';
  if (rule.kind === 'latency') return evidence.latencyMs === undefined || !Number.isFinite(evidence.latencyMs) || evidence.latencyMs < 0 ? 'inconclusive' : evidence.latencyMs <= Number(rule.value) ? 'pass' : 'fail';
  // Prefer the final agent response from a complete saved conversation. Customer
  // text and earlier responses must not satisfy a final-response rule.
  const final = !evidence.conversationTruncated ? [...(evidence.conversation ?? [])].reverse().find(turn => turn.role === 'agent')?.message.trim() : undefined;
  const hasFinal = Boolean(final && (!evidence.reply || final.startsWith(evidence.reply)));
  const reply = hasFinal ? final : evidence.reply;
  if (!reply) return 'inconclusive';
  // Older saved previews had no truncation marker and were clipped at 480
  // characters. Treat a full-size legacy preview conservatively.
  const complete = hasFinal || evidence.replyTruncated === false || evidence.replyTruncated !== true && reply.length < 480;
  const contains = reply.toLowerCase().includes(rule.value.toLowerCase());
  if (!contains && !complete) return 'inconclusive';
  return (rule.kind === 'contains' ? contains : !contains) ? 'pass' : 'fail';
}

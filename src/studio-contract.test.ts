import { describe, expect, it } from 'vitest';
import {
  AGENT_SOURCE_MAX,
  isProposalOutcome, isProposeEditInput, isStudioComment, isStudioDiagnostic, isStudioDiagnostics, isStudioViewPublisher, isStudioViewReference, isStudioViewState,
  CONTEXT_CHANGED_CHANNEL, STUDIO_CHANGED_CHANNEL, STUDIO_RPC, UI_WAKE_CHANNEL, contextOrigin
} from '../lib/studio-contract.js';

const sha = 'a'.repeat(64);
const diag = { line: 1, column: 1, endLine: 1, endColumn: 4, severity: 'error', message: 'bad' } as const;
const comment = { id: 'c', path: 'a.agent', line: 2, endLine: 3, quote: 'q', body: 'b', author: { kind: 'agent', threadId: 't', name: 'Claude' }, createdAt: 1 };
const view = { surface: 'studio', path: 'a.agent', dirty: false, tool: 'code', diagnostics: [diag], share: true, at: 1 };

describe('studio contract', () => {
  it('exposes stable RPC names and channels', () => {
    expect(STUDIO_RPC.trace).toBe('agentLab.trace');
    expect(STUDIO_RPC.outcome).toBe('control.outcome');
    expect(UI_WAKE_CHANNEL).toBe('sf.ui.wake');
    expect(STUDIO_CHANGED_CHANNEL).toBe('sf.studio.changed');
    expect(CONTEXT_CHANGED_CHANNEL).toBe('context.changed');
  });
  it('accepts only a short, plain window origin', () => {
    expect(contextOrigin({ origin: 'w_1-a' })).toBe('w_1-a');
    for (const bad of [null, 'w1', {}, { origin: '' }, { origin: 'a'.repeat(65) }, { origin: 'a b' }, { origin: 'a/b' }, { origin: 7 }]) expect(contextOrigin(bad)).toBeNull();
  });
  it('validates diagnostics and bounds the list', () => {
    expect(isStudioDiagnostic({ ...diag, code: 'x' })).toBe(true);
    for (const bad of [null, { ...diag, line: 0 }, { ...diag, severity: 'fatal' }, { ...diag, message: 1 }, { ...diag, code: 3 }, { ...diag, message: 'x'.repeat(2001) }]) expect(isStudioDiagnostic(bad)).toBe(false);
    expect(isStudioDiagnostics(Array(50).fill(diag))).toBe(true);
    expect(isStudioDiagnostics(Array(51).fill(diag))).toBe(false);
    expect(isStudioDiagnostics(Array(200).fill(diag), 200)).toBe(true);
    expect(isStudioDiagnostics('no')).toBe(false);
  });
  it('validates proposal outcomes', () => {
    expect(isProposalOutcome({ outcome: 'partial', acceptedHunks: 1, rejectedHunks: 2, sha256: sha, note: 'n' })).toBe(true);
    for (const bad of [null, { outcome: 'maybe', acceptedHunks: 0, rejectedHunks: 0 }, { outcome: 'accepted', acceptedHunks: -1, rejectedHunks: 0 }, { outcome: 'accepted', acceptedHunks: 0, rejectedHunks: 0.5 }, { outcome: 'accepted', acceptedHunks: 0, rejectedHunks: 0, sha256: 1 }, { outcome: 'accepted', acceptedHunks: 0, rejectedHunks: 0, note: 'x'.repeat(2001) }]) expect(isProposalOutcome(bad)).toBe(false);
  });
  it('validates comments', () => {
    expect(isStudioComment(comment)).toBe(true);
    expect(isStudioComment({ ...comment, resolved: { at: 1, note: 'done', by: 't' } })).toBe(true);
    for (const bad of [null, { ...comment, author: null }, { ...comment, endLine: 1 }, { ...comment, line: 0 }, { ...comment, author: { kind: 'bot', name: 'x' } }, { ...comment, author: { kind: 'user', name: 1 } }, { ...comment, author: { kind: 'user', name: 'x', threadId: 1 } }, { ...comment, quote: 'x'.repeat(2001) }, { ...comment, body: 'x'.repeat(4001) }, { ...comment, createdAt: 'now' }, { ...comment, resolved: { at: 1 } }, { ...comment, id: 1 }]) expect(isStudioComment(bad)).toBe(false);
  });
  it('validates propose-edit inputs: exactly one of content or edits, bounded', () => {
    const base = { path: 'a.agent', expectedSha256: sha, summary: 's' };
    expect(isProposeEditInput({ ...base, content: 'x' })).toBe(true);
    expect(isProposeEditInput({ ...base, edits: [{ startLine: 1, endLine: 2, text: 't' }] })).toBe(true);
    expect(isProposeEditInput({ ...base, edits: [{ startLine: 3, endLine: 2, text: '' }] })).toBe(true); // pure insertion
    for (const bad of [null, base, { ...base, content: 'x', edits: [] }, { ...base, content: 1 }, { ...base, content: 'x'.repeat(AGENT_SOURCE_MAX + 1) }, { ...base, path: '' }, { ...base, content: 'x', expectedSha256: 'short' }, { ...base, content: 'x', summary: 1 },
      { ...base, edits: [] }, { ...base, edits: Array(51).fill({ startLine: 1, endLine: 1, text: '' }) }, { ...base, edits: [{ startLine: 0, endLine: 1, text: '' }] }, { ...base, edits: [{ startLine: 5, endLine: 2, text: '' }] }, { ...base, edits: [{ startLine: 1, endLine: 1, text: 1 }] }, { ...base, edits: 'x' }]) expect(isProposeEditInput(bad)).toBe(false);
  });
  it('validates view state', () => {
    expect(isStudioViewState(view)).toBe(true);
    expect(isStudioViewState({ ...view, surface: 'sidepanel', path: null, tool: null, sha256: sha, orgAlias: 'dev', cursor: { line: 1, column: 1 }, selection: { startLine: 1, endLine: 2, text: 'x' }, lastRun: { runId: 'r', engine: 'live', turn: 2 } })).toBe(true);
    for (const bad of [null, { ...view, surface: 'x' }, { ...view, path: 1 }, { ...view, dirty: 'no' }, { ...view, tool: 'zzz' }, { ...view, cursor: { line: 0, column: 1 } }, { ...view, selection: { startLine: 1, endLine: 1, text: 'x'.repeat(2001) } }, { ...view, lastRun: { runId: 'r', engine: 'warp' } }, { ...view, diagnostics: Array(51).fill(diag) }, { ...view, orgAlias: 1 }, { ...view, sha256: 1 }, { ...view, at: 'x' }]) expect(isStudioViewState(bad)).toBe(false);
  });
  it('bounds publisher identity and accepts only positive safe sequence numbers', () => {
    expect(isStudioViewPublisher({ id: 'window_A-1', sequence: Number.MAX_SAFE_INTEGER })).toBe(true);
    for (const value of [null, [], {}, { id: 1, sequence: 1 }, { id: '', sequence: 1 }, { id: 'x'.repeat(101), sequence: 1 }, { id: 'window/path', sequence: 1 }, { id: 'window', sequence: 0 }, { id: 'window', sequence: -1 }, { id: 'window', sequence: 1.5 }, { id: 'window', sequence: NaN }, { id: 'window', sequence: Infinity }, { id: 'window', sequence: Number.MAX_SAFE_INTEGER + 1 }]) expect(isStudioViewPublisher(value)).toBe(false);
  });
  it('bounds read-only references and confines optional paths to relative project metadata', () => {
    const reference = { kind: 'flow', apiName: 'Billing', path: 'force-app/main/default/flows/Billing.flow-meta.xml', source: 'project' };
    expect(isStudioViewReference(reference)).toBe(true);
    expect(isStudioViewState({ ...view, reference })).toBe(true);
    expect(isStudioViewReference({ kind: 'apex', apiName: 'c__OrderAction', source: 'org' })).toBe(true);
    expect(isStudioViewReference({ kind: 'lightning-type', apiName: 'c__Order' })).toBe(true);
    expect(isStudioViewReference({ kind: 'lwc', apiName: 'c/orderSummary' })).toBe(true);
    for (const bad of [null, {}, { ...reference, kind: 'agent' }, { ...reference, apiName: '' }, { ...reference, apiName: 1 }, { ...reference, apiName: 'x'.repeat(201) }, { ...reference, apiName: 'Name\nInstruction' }, { ...reference, source: 'remote' }, ...['', '/tmp/file.xml', '~/file.xml', 'C:/file.xml', 'force-app/../file.xml', 'force-app\\file.xml', 'force-app/\x00file.xml', 'x'.repeat(1001)].map(path => ({ ...reference, path })), { ...reference, path: 1 }]) {
      expect(isStudioViewReference(bad)).toBe(false);
      expect(isStudioViewState({ ...view, reference: bad })).toBe(false);
    }
  });
});

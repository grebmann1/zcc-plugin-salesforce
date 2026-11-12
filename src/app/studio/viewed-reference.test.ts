import { describe, expect, it } from 'vitest';
import { activeDocumentContext } from './viewed-reference.js';
import type { EditorTab } from './studio-layout.js';

const editor = { cursor: { line: 45, column: 3 }, selection: { startLine: 45, endLine: 46, text: 'hidden owner selection' } };
const flow: EditorTab = { id: 'flow:Billing', kind: 'flow', label: 'Billing', target: 'flow://Billing', path: 'force-app/main/default/flows/Billing.flow-meta.xml' };

describe('activeDocumentContext', () => {
  it('keeps coordinates only when the agent script is the active document', () => {
    expect(activeDocumentContext(null, 'project', editor)).toBe(editor);
    expect(activeDocumentContext({ id: 'script', kind: 'agent', label: 'GuiAgentReview.agent' }, 'project', editor)).toBe(editor);
    expect(activeDocumentContext({ id: 'tests', kind: 'view', label: 'Tests', target: 'tests' }, 'project', editor)).toEqual({});
    expect(activeDocumentContext({ id: 'org', kind: 'org', label: 'Agents', target: 'agents' }, 'org', editor)).toEqual({});
  });

  it('reports the foreground Flow source without borrowing the agent editor selection', () => {
    expect(activeDocumentContext(flow, 'project', editor)).toEqual({ reference: { kind: 'flow', apiName: 'Billing', path: flow.path, source: 'project' } });
    expect(activeDocumentContext(flow, 'org', editor)).toEqual({ reference: { kind: 'flow', apiName: 'Billing', source: 'org' } });
  });

  it.each([
    ['apex', 'apex://QuoteAction', 'apex', 'QuoteAction'],
    ['type', 'c__Order', 'lightning-type', 'c__Order'],
    ['lwc', 'orderSummary', 'lwc', 'orderSummary']
  ] as const)('describes %s references using their actual API target', (kind, target, expectedKind, apiName) => {
    const context = activeDocumentContext({ id: 'resource', kind, label: 'Display label', target }, 'org', editor);
    expect(context).toEqual({ reference: { kind: expectedKind, apiName, source: kind === 'apex' ? 'org' : 'project' } });
    expect(context).not.toHaveProperty('cursor');
    expect(context).not.toHaveProperty('selection');
  });

  it('supports label fallback and ignores malformed resource metadata', () => {
    expect(activeDocumentContext({ id: 'flow', kind: 'flow', label: 'Billing' }, 'project', {})).toEqual({ reference: { kind: 'flow', apiName: 'Billing', source: 'project' } });
    expect(activeDocumentContext({ ...flow, target: 'flow://Bad\nName' }, 'project', editor)).toEqual({});
    expect(activeDocumentContext({ ...flow, path: '../outside.flow-meta.xml' }, 'project', editor)).toEqual({});
  });
});

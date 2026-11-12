import { isStudioViewReference, type StudioViewState } from '../../../lib/studio-contract.js';
import type { EditorTab } from './studio-layout.js';

/** Foreground metadata is descriptive; the owning agent path stays unchanged. */
export function activeDocumentContext(tab: EditorTab | null, origin: 'project' | 'org', editor: Pick<StudioViewState, 'cursor' | 'selection'>): Pick<StudioViewState, 'reference' | 'cursor' | 'selection'> {
  if (!tab || tab.kind === 'agent') return editor;
  // Coordinates belong to the hidden agent iframe, never the read-only tab.
  if (tab.kind === 'org' || tab.kind === 'view') return {};
  const kind = tab.kind === 'type' ? 'lightning-type' : tab.kind;
  const source = kind === 'apex' || kind === 'flow' ? origin : 'project';
  const reference = {
    kind, apiName: tab.target?.replace(/^(?:apex|flow):\/\//, '') ?? tab.label,
    source, ...(source === 'project' && tab.path ? { path: tab.path } : {})
  };
  return isStudioViewReference(reference) ? { reference } : {};
}

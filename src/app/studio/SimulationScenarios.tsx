import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, MessageSquare, Plus, Search, Target, Trash2, UserRound } from 'lucide-react';
import { useStudioSplit } from './StudioResize.js';
import type { SimulationScenarioInput } from '../../../lib/simulation-contract.js';
import type { ContextEntry, PreviewContextField, PreviewContextVariable } from '../../../lib/preview-context.js';
import { contextEntries, ScenarioVariables } from './ScenarioVariables.js';
import type { ContextPreset } from '../../../lib/preview-context-preset-contract.js';

export type EditableScenario = SimulationScenarioInput & { key: string; revision?: number; contextEntries?: Record<string, ContextEntry> };
interface Props {
  variant?: 'library' | 'batch';
  showInclusion?: boolean;
  editorFooter?: ReactNode;
  onIncludeMany?(keys: string[], include: boolean): void;
  storageKey?: string;
  scenarios: EditableScenario[]; included: string[]; activeKey: string; attention: Set<string>; disabled: boolean;
  contextFields?: PreviewContextField[]; inheritedContext?: PreviewContextVariable[];
  contextPresets?: ContextPreset[]; presetsLoading?: boolean; presetsError?: string | null; onReloadPresets?(): void;
  onSelect(key: string): void; onToggle(key: string): void; onEdit(key: string, patch: Partial<EditableScenario>): void;
  onAdd(): void; onRemove(key: string): void;
}

/** One scenario stays in focus while the catalogue remains available beside it. */
export function SimulationScenarios({ variant = 'batch', showInclusion = true, editorFooter, onIncludeMany, storageKey, scenarios, included, activeKey, attention, disabled, contextFields, inheritedContext, contextPresets, presetsLoading, presetsError, onReloadPresets, onSelect, onToggle, onEdit, onAdd, onRemove }: Props) {
  const split = useStudioSplit({ storageKey, initial: 36, breakpoint: 760, stack: false, minPane: 170 });
  const root = useRef<HTMLDivElement>(null);
  const splitRef = split.ref;
  const setRoot = useCallback((element: HTMLDivElement | null) => { root.current = element; splitRef(element); }, [splitRef]);
  const nameId = useId();
  const body = useRef<HTMLFieldSetElement>(null);
  const heading = useRef<HTMLInputElement>(null);
  const catalogue = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [tab, setTab] = useState<'Setup' | 'Variables'>('Setup');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(false);
  const active = scenarios.find(row => row.key === activeKey) ?? scenarios[0];
  const index = scenarios.indexOf(active!);
  const rows = scenarios.filter(row => (!filter || attention.has(row.name)) && `${row.name} ${row.persona} ${row.goal}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [active?.key, tab]);
  useEffect(() => {
    if (opened && root.current && root.current.clientWidth <= 760) heading.current?.focus();
    if (!opened && returnFocus.current) {
      const buttons = catalogue.current?.querySelectorAll<HTMLButtonElement>('[data-scenario-key]');
      Array.from(buttons ?? []).find(button => button.dataset.scenarioKey === returnFocus.current)?.focus(); returnFocus.current = null;
    }
  }, [opened, active?.key]);
  const choose = (key: string) => { onSelect(key); setOpened(true); };
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-scenario-key]'));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    onSelect(buttons[next]!.dataset.scenarioKey!); buttons[next]!.focus();
  };
  return <div className={`sf-sim-workspace sf-tests-workspace${opened && active ? ' has-selection' : ''}`} ref={setRoot} style={split.style}>
    <aside className="sf-sim-catalogue" aria-label="Scenario catalogue">
      <label className="sf-sim-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Search scenarios" placeholder="Search scenarios…" value={query} onChange={event => { setQuery(event.target.value); setOpened(false); }} /></label>
      {variant === 'batch' && <div className="sf-sim-filters" role="group" aria-label="Filter scenarios">
        <button type="button" aria-pressed={!filter} onClick={() => { setFilter(false); setOpened(false); }}>All scenarios</button>
        <button type="button" aria-pressed={filter} onClick={() => { setFilter(true); setOpened(false); }}>Needs attention</button>
      </div>}
      <div className="sf-sim-selection"><span className="sf-tp-sub" role="status">{rows.length} of {scenarios.length} scenarios{variant === 'batch' ? ` · ${scenarios.filter(row => included.includes(row.key)).length} selected` : ''}</span>
        {variant === 'batch' && onIncludeMany && <div><button type="button" className="sf-tp-btn" disabled={disabled || !rows.some(row => !included.includes(row.key))} onClick={() => onIncludeMany(rows.map(row => row.key), true)}>{query || filter ? 'Select matching' : 'Select all'}</button><button type="button" className="sf-tp-btn" disabled={disabled || !included.length} onClick={() => onIncludeMany(included, false)}>Clear selection</button></div>}
      </div>
      <div ref={catalogue} className="sf-sim-scenarios" role="region" aria-label="Scenario list" tabIndex={0} onKeyDown={navigate}>
        {rows.map(row => <div key={row.key} className={`sf-sim-scenario${active?.key === row.key ? ' is-active' : ''}`}>
          {variant === 'batch' && showInclusion && <input type="checkbox" aria-label={row.name || 'Untitled scenario'} checked={included.includes(row.key)} disabled={disabled} onChange={() => onToggle(row.key)} />}
          <button type="button" data-scenario-key={row.key} aria-label={`Edit ${row.name || 'Untitled scenario'}`} aria-pressed={active?.key === row.key} onClick={() => choose(row.key)}>
            <strong>{row.name || 'Untitled scenario'}</strong><span>{row.goal || 'Define a customer goal'}</span>
            <span>{row.origin || row.revision ? `Revision ${row.origin?.revision ?? row.revision}` : 'Local setup'} · {row.maxTurns} turns · {row.contextEntries ? Object.keys(row.contextEntries).length : row.contextVariables?.length ?? 0} variables</span>
            {attention.has(row.name) && <small>Needs attention</small>}
          </button>
        </div>)}
        {!rows.length && <p className="sf-sim-catalogue-empty">{filter ? 'No scenarios need attention.' : 'No matching scenarios.'}</p>}
      </div>
      <p className="sf-sim-catalogue-hint">↑ ↓ to move between scenarios · Enter to open</p>
      <button type="button" className="sf-sim-add" disabled={disabled || scenarios.length >= 30} onClick={() => { setQuery(''); setFilter(false); setTab('Setup'); setOpened(true); onAdd(); }}><Plus size={14} aria-hidden="true" />{variant === 'library' ? 'New scenario' : 'Add scenario'}</button>
      {scenarios.length >= 30 && <small className="sf-tp-sub">Maximum 30 scenarios in this catalogue.</small>}
    </aside>
    {split.divider('Resize scenario catalogue and editor')}
    {active ? <section className="sf-sim-editor" aria-label="Scenario details">
      <header className="sf-sim-editor-head"><button type="button" className="sf-tp-btn sf-sim-back" onClick={() => { returnFocus.current = active.key; setOpened(false); }}>← All scenarios</button>
      <div className="sf-sim-editor-title"><label className="sf-sim-sr" htmlFor={nameId}>Scenario {index + 1} name</label><input ref={heading} disabled={disabled} id={nameId} aria-label={`Scenario ${index + 1} name`} value={active.name} maxLength={80} placeholder="Name this scenario" onChange={event => onEdit(active.key, { name: event.target.value })} />
        <button type="button" disabled={disabled || variant === 'batch' && Boolean(active.origin) && !included.includes(active.key)} className="sf-sim-icon" aria-label={variant === 'batch' && active.origin ? 'Exclude from batch' : `Remove scenario ${index + 1}`} title={variant === 'batch' && active.origin ? 'Exclude from batch' : 'Remove scenario'} onClick={() => onRemove(active.key)}><Trash2 size={15} aria-hidden="true" /></button></div>
      <p className="sf-sim-editor-intro">Define the customer, the conversation and what success looks like.</p>
      {variant === 'library' && <div className="sf-cases-tabs" role="tablist" aria-label="Scenario detail">{(['Setup', 'Variables'] as const).map(name => <button type="button" role="tab" key={name} id={`${nameId}-${name}`} aria-selected={tab === name} aria-controls={`${nameId}-content`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'Setup' : event.key === 'End' ? 'Variables' : tab === 'Setup' ? 'Variables' : 'Setup'; setTab(next); document.getElementById(`${nameId}-${next}`)?.focus(); } }}>{name}</button>)}</div>}
      </header>
      <fieldset ref={body} className="sf-sim-editor-body" disabled={disabled} aria-label={`Scenario ${index + 1}`}>
      <div id={`${nameId}-content`} role={variant === 'library' ? 'tabpanel' : undefined} aria-labelledby={variant === 'library' ? `${nameId}-${tab}` : undefined}>
      <div hidden={variant === 'library' && tab !== 'Setup'}><div className="sf-sim-fields">{([
        ['persona', 'Customer persona', UserRound], ['goal', 'Customer goal', Target],
        ['opening', 'Opening message', MessageSquare], ['criteria', 'Success criteria', Check],
      ] as const).map(([field, label, Icon]) => <label key={field} className={`sf-sim-field is-${field}`}>
        <span><Icon size={14} aria-hidden="true" />{label}</span>
        <textarea aria-label={`Scenario ${index + 1} ${field}`} value={active[field]} maxLength={field === 'persona' || field === 'goal' ? 2000 : 4000} rows={field === 'criteria' ? 4 : 3} onChange={event => onEdit(active.key, { [field]: event.target.value })} />
        {field === 'opening' && <small>The first message sent by the simulated customer.</small>}
        {field === 'criteria' && <small>The judge checks these expectations against the conversation.</small>}
      </label>)}</div>
      <div className="sf-sim-editor-footer"><label>Maximum turns<input aria-label={`Scenario ${index + 1} maximum turns`} type="number" min={1} max={8} value={active.maxTurns} onChange={event => onEdit(active.key, { maxTurns: Number(event.target.value) })} /></label><span>{variant === 'library' ? 'Save to share these changes' : 'Edits apply to the next run'}</span></div>
      </div><div hidden={variant === 'library' && tab !== 'Variables'}><ScenarioVariables key={active.key} defaultsLabel={variant === 'library' ? 'Runtime defaults' : 'Batch defaults'} description={variant === 'library' ? 'Starting values copied when this scenario is selected for a run.' : undefined} fields={contextFields} inherited={inheritedContext} presets={contextPresets} presetsLoading={presetsLoading} presetsError={presetsError} onReloadPresets={onReloadPresets} entries={active.contextEntries ?? contextEntries(active.contextVariables)} onChange={contextEntries => onEdit(active.key, { contextEntries })} /></div>
      </div></fieldset>
      {editorFooter && <div className="sf-sim-detail-footer">{editorFooter}</div>}
    </section> : <div className="sf-sim-editor sf-sim-placeholder"><MessageSquare size={24} aria-hidden="true" /><h3>Create your first scenario</h3><p>Describe a customer journey and the outcome you expect.</p><button type="button" className="sf-tp-btn" disabled={disabled} onClick={() => { setOpened(true); onAdd(); }}>Add your first scenario</button></div>}
  </div>;
}

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PanelRight, Plus, X } from 'lucide-react';
import { StudioToolPicker } from './studio/StudioToolPicker.js';
import { AGENT_SCRIPT_TOOLS, type AgentScriptTool } from './studio/studio-tool-catalog.js';
export { AGENT_SCRIPT_TOOLS, type AgentScriptTool } from './studio/studio-tool-catalog.js';

/** Fallback columns own local tools; conversation views use the editor workspace and Assistant uses the host. */
export const COLUMN_TOOLS: readonly AgentScriptTool[] = AGENT_SCRIPT_TOOLS.filter(tool => !['graph', 'preview', 'test', 'evals', 'org-preview', 'assistant'].includes(tool.id)).map(tool => tool.id);
export const isColumnTool = (value: unknown): value is AgentScriptTool => COLUMN_TOOLS.includes(value as AgentScriptTool);
type ToolState = { tabs: AgentScriptTool[]; active: AgentScriptTool | 'new'; open: boolean };
const initialState: ToolState = { tabs: ['files'], active: 'files', open: true };

function readState(key: string): ToolState {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || !Array.isArray(value.tabs)) return initialState;
    const tabs = [...new Set<AgentScriptTool>(value.tabs.filter(isColumnTool))];
    return { tabs, active: tabs.includes(value.active) ? value.active : 'new', open: value.open !== false };
  } catch { return initialState; }
}

/** Only layout is persisted here. Each tool retains its own draft/session state. */
export function useAgentScriptTools(scope: string) {
  const key = `salesforce:agent-tools:${scope}`;
  const [state, setState] = useState(() => readState(key));
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Layout persistence is optional. */ } }, [key, state]);
  const openTool = useCallback((id: AgentScriptTool) => setState(current => ({
    tabs: current.tabs.includes(id) ? current.tabs : [...current.tabs, id], active: id, open: true,
  })), []);
  return { state, openTool,
    setOpen: (open: boolean) => setState(current => ({ ...current, open })),
    select: (active: ToolState['active']) => setState(current => ({ ...current, active, open: true })),
    toggle: () => setState(current => ({ ...current, open: !current.open })),
    close: (id: AgentScriptTool) => setState(current => {
      const tabs = current.tabs.filter(tab => tab !== id);
      return { ...current, tabs, active: current.active === id ? tabs[Math.max(0, current.tabs.indexOf(id) - 1)] ?? 'new' : current.active };
    }),
  };
}

export function AgentScriptTools({ tools, render, hiddenTools = [], chrome = true, open, onOpenTool }: {
  tools: ReturnType<typeof useAgentScriptTools>;
  render: (id: AgentScriptTool, visible: boolean) => ReactNode;
  /** Route all catalog entries through the workspace, including editor views and Assistant. */
  onOpenTool?: (id: AgentScriptTool) => void;
  /** Tools shown elsewhere in this layout (kept mounted, but without a tab or picker entry). */
  hiddenTools?: readonly AgentScriptTool[];
  /** False when an external strip switches tools (compact layout). */
  chrome?: boolean;
  /** Overrides the persisted open flag (compact layouts show the panel only for a non-editor tool). */
  open?: boolean;
}) {
  const prefix = useId();
  const strip = useRef<HTMLDivElement>(null);
  const isOpen = open ?? tools.state.open;
  const visibleTabs = tools.state.tabs.filter(id => !hiddenTools.includes(id));
  const active = tools.state.active !== 'new' && hiddenTools.includes(tools.state.active) ? visibleTabs[0] ?? 'new' : tools.state.active;
  const state = { ...tools.state, tabs: visibleTabs, active, open: isOpen };
  useEffect(() => {
    strip.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [state.active, state.open]);
  const title = (id: AgentScriptTool) => AGENT_SCRIPT_TOOLS.find(tool => tool.id === id)!.title;
  return <aside className="af-tools" aria-label="AgentScript side panel" hidden={!state.open}>
    {chrome && <div className="thread-secondary-chrome">
      <div className="thread-secondary-tabs" role="tablist" aria-label="AgentScript tools" ref={strip}>
        {state.tabs.map(id => <span className={`thread-secondary-tab${state.active === id ? ' is-active' : ''}`} key={id}>
          <button type="button" className="thread-secondary-tab-label" title={title(id)} role="tab" id={`${prefix}-${id}`} aria-controls={`${prefix}-${id}-panel`} aria-selected={state.active === id}
            tabIndex={state.active === id ? 0 : -1} onClick={() => tools.select(id)} onKeyDown={event => {
              const index = state.tabs.indexOf(id);
              const next = event.key === 'ArrowRight' ? (index + 1) % state.tabs.length : event.key === 'ArrowLeft' ? (index + state.tabs.length - 1) % state.tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? state.tabs.length - 1 : null;
              if (next !== null) { event.preventDefault(); tools.select(state.tabs[next]); document.getElementById(`${prefix}-${state.tabs[next]}`)?.focus(); }
              if (event.key === 'Delete') { event.preventDefault(); tools.close(id); strip.current?.parentElement?.querySelector<HTMLButtonElement>('[aria-label="Add side panel tab"]')?.focus(); }
            }}>{title(id)}</button>
          <button type="button" className="thread-secondary-tab-close" title={`Close ${title(id)}`} aria-label={`Close ${title(id)}`} onClick={() => { tools.close(id); strip.current?.parentElement?.querySelector<HTMLButtonElement>('[aria-label="Add side panel tab"]')?.focus(); }}><X size={11} aria-hidden="true" /></button>
        </span>)}
      </div>
      <div className="thread-secondary-controls">
        <button type="button" className="thread-secondary-pin" aria-label="Add side panel tab" title="Add a tool" onClick={() => tools.select('new')}><Plus size={15} aria-hidden="true" /></button>
        <button type="button" className="thread-secondary-pin" aria-label="Hide side panel" title="Hide side panel" onClick={tools.toggle}><PanelRight size={15} aria-hidden="true" /></button>
      </div>
    </div>}
    {chrome && state.active === 'new' && <div className="af-tool-picker">
      <StudioToolPicker onSelect={onOpenTool ?? tools.openTool} hiddenTools={hiddenTools} openTools={state.tabs} />
    </div>}
    {tools.state.tabs.map(id => <div key={id} className="af-tool-content" role="tabpanel" id={`${prefix}-${id}-panel`} aria-labelledby={`${prefix}-${id}`} hidden={state.active !== id}>
      {render(id, state.open && state.active === id)}
    </div>)}
  </aside>;
}

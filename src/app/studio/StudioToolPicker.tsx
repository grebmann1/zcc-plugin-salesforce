import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { AGENT_SCRIPT_TOOLS, type AgentScriptTool } from './studio-tool-catalog.js';

import { BUILDER_TOOL_CATALOG } from './builder-tool-catalog.js';

/** Shared catalog for the native host and embedded panel layouts. */
export function StudioToolPicker({ onSelect, hiddenTools = [], openTools = [] }: {
  onSelect(id: AgentScriptTool): void; hiddenTools?: readonly AgentScriptTool[]; openTools?: readonly AgentScriptTool[];
}) {
  const [query, setQuery] = useState('');
  const matches = AGENT_SCRIPT_TOOLS.filter(tool => !hiddenTools.includes(tool.id) && `${tool.title} ${tool.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="sf-builder-picker" aria-label="Studio tool catalog">
    <header><h2>Add a tool</h2><p>Open beside your AgentScript editor.</p></header>
    <input autoFocus type="search" aria-label="Search Studio tools" placeholder="Find a tool…" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="sf-builder-catalog">{matches.map(tool => <button type="button" key={tool.id} onClick={() => onSelect(tool.id)}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={tool.icon} /></svg>
      <span><strong>{tool.title}</strong><small>{tool.description}</small></span><span className="sf-builder-origin">{openTools.includes(tool.id) ? 'Open' : BUILDER_TOOL_CATALOG.some(row => row.id === tool.id) ? 'Builder' : 'Studio'}</span>
    </button>)}</div>
    {!matches.length && <p role="status">No tools match “{query}”.</p>}
  </section>;
}

export function StudioToolMenu({ onSelect }: { onSelect(id: AgentScriptTool): void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const dismiss = () => setOpen(false);
    // Pointer events inside Monaco do not bubble to the outer document. Listen
    // in existing same-origin frames, including one that finishes loading later.
    const frames = [...document.querySelectorAll('iframe')], documents = new Set<Document>();
    const listenInFrames = () => frames.forEach(frame => {
      try {
        const doc = frame.contentDocument;
        if (doc && !documents.has(doc)) { doc.addEventListener('pointerdown', dismiss, true); documents.add(doc); }
      } catch { /* Cross-origin frames still dismiss through focus/blur. */ }
    });
    listenInFrames();
    frames.forEach(frame => frame.addEventListener('load', listenInFrames));
    document.addEventListener('pointerdown', close);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', close); window.removeEventListener('blur', dismiss); window.removeEventListener('resize', dismiss);
      frames.forEach(frame => frame.removeEventListener('load', listenInFrames));
      documents.forEach(doc => doc.removeEventListener('pointerdown', dismiss, true));
    };
  }, [open]);
  return <div className="sf-builder-launcher" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} type="button" className="sf-as-save" aria-label="Add Studio tool" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><Plus size={14} aria-hidden="true" />Add tool</button>
    {open && <div id={id} role="dialog" aria-label="Add Studio tool" className="sf-builder-menu"><StudioToolPicker onSelect={tool => { setOpen(false); trigger.current?.focus(); onSelect(tool); }} /></div>}
  </div>;
}

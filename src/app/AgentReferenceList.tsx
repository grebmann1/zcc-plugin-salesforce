import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronRight, Search } from 'lucide-react';

/** One browse-and-inspect row for actions, Lightning Types and their components. */
export function AgentReferenceRow({ icon, kind, name, reference, meta, active, className = '', ...button }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: ReactNode; kind: string; name: string; reference: string; meta: string; active?: boolean;
}) {
  return <button {...button} type="button" className={`sf-reference-row ${className}${active ? ' is-active' : ''}`} aria-current={active ? 'true' : undefined}>
    <span className={`sf-reference-icon ${kind}`} aria-hidden="true">{icon}</span>
    <span className="sf-reference-name sf-as-tree-name"><strong>{name}</strong><code>{reference}</code></span>
    <span className="sf-reference-meta sf-as-tree-meta">{meta}</span>
    <ChevronRight className="sf-reference-chevron" size={14} aria-hidden="true" />
  </button>;
}

export function AgentReferenceSearch({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange(value: string): void;
}) {
  return <label className="sf-reference-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></label>;
}

export const AGENT_REFERENCE_STYLES = `
.sf-reference-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
.sf-reference-head h2 { display:flex; align-items:center; gap:7px; margin:0; font-size:14px; }
.sf-reference-count { padding:2px 6px; border-radius:5px; background:var(--sf-soft); color:var(--sf-muted); font-size:10px; font-weight:500; }
.sf-reference-note { margin:12px 0; color:var(--sf-muted); font-size:11px; }
.sf-reference-search { display:flex; align-items:center; gap:7px; box-sizing:border-box; width:100%; padding:7px 9px; border:1px solid var(--sf-border); border-radius:6px; background:var(--sf-surface); color:var(--sf-muted); }
.sf-reference-search svg { flex-shrink:0; }
.sf-reference-search input { width:100%; min-width:0; padding:0; border:0; background:transparent; color:var(--sf-text); font:inherit; font-size:12px; outline:none; }
.sf-reference-search:has(input:focus-visible) { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-reference-group-label { margin:16px 0 6px; padding:0 4px; color:var(--sf-muted); font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; overflow-wrap:anywhere; }
.sf-reference-group-label > span { margin-left:6px; font-weight:400; }
.sf-reference-row { box-sizing:border-box; display:flex; align-items:center; width:100%; min-width:0; min-height:58px; gap:9px; padding:9px 6px; text-align:left; border:0; border-bottom:1px solid var(--sf-border); border-radius:0; background:transparent; color:var(--sf-text); font:inherit; font-size:12px; cursor:pointer; }
.sf-reference-row:hover { background:var(--sf-soft); }
.sf-reference-row.is-active { background:color-mix(in srgb,var(--sf-accent) 10%,transparent); box-shadow:inset 2px 0 var(--sf-accent); }
.sf-reference-row:focus-visible { outline:2px solid var(--sf-accent); outline-offset:-2px; }
.sf-reference-icon { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:28px; height:28px; border-radius:6px; color:var(--sf-purple,#a889e8); background:color-mix(in srgb,var(--sf-purple,#a889e8) 10%,transparent); }
.sf-reference-icon.flow,.sf-reference-icon.component { color:var(--sf-accent); background:color-mix(in srgb,var(--sf-accent) 9%,transparent); }
.sf-reference-icon.action { color:var(--sf-muted); background:var(--sf-soft); }
.sf-reference-row .sf-reference-name { flex:1; min-width:0; overflow:visible; white-space:normal; overflow-wrap:anywhere; }
.sf-reference-name strong { display:block; font-weight:500; line-height:1.4; }
.sf-reference-name code { display:block; margin-top:3px; color:var(--sf-muted); font-size:10px; line-height:1.4; }
.sf-reference-row .sf-reference-meta { flex-shrink:0; margin:0; color:var(--sf-muted); font-size:10px; }
.sf-reference-chevron { flex-shrink:0; color:var(--sf-muted); }
@container (max-width:420px) { .sf-reference-row .sf-reference-meta { display:none; } }
`;

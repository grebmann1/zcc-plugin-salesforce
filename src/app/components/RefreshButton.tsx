import { RefreshCw } from 'lucide-react';

const STYLES = `
button.sf-refresh-button { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:28px; height:28px; min-width:28px; min-height:28px; padding:0; border:1px solid var(--sf-border,var(--border)); border-radius:6px; background:transparent; color:var(--sf-muted,var(--text-muted)); cursor:pointer; }
button.sf-refresh-button:not(:disabled):hover { background:var(--sf-elevated,var(--bg-hover)); color:var(--sf-text,var(--text-primary)); }
button.sf-refresh-button:focus-visible { outline:2px solid var(--sf-accent,var(--accent)); outline-offset:2px; }
button.sf-refresh-button:disabled { opacity:.5; cursor:default; }
button.sf-refresh-button[aria-busy=true] svg { animation:sf-refresh-turn 1s linear infinite; }
@keyframes sf-refresh-turn { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { button.sf-refresh-button[aria-busy=true] svg { animation:none; } }
`;

export function RefreshButton({ label, busy = false, disabled = false, onClick }: {
  label: string; busy?: boolean; disabled?: boolean; onClick(): void;
}) {
  return <><style>{STYLES}</style><button type="button" className="sf-refresh-button" aria-label={label} title={label}
    aria-busy={busy} disabled={busy || disabled} onClick={onClick}><RefreshCw size={15} aria-hidden="true" /></button></>;
}

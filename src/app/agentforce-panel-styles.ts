import { STUDIO_TOKENS } from './studio/studio-tokens.js';

export const AGENTFORCE_PANEL_STYLES = `
${STUDIO_TOKENS}.sf-as-header { display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 16px; flex-shrink: 0; background: var(--sf-elevated); border-bottom: 1px solid var(--sf-border); color: var(--sf-text); }
.sf-as-brand { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
.sf-as-crumb { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--sf-muted); font-size: 13px; }
.sf-as-crumb-seg { color: var(--sf-muted); white-space: nowrap; }
.sf-as-crumb-seg:last-child { color: var(--sf-text); overflow: hidden; text-overflow: ellipsis; }
.sf-as-tabs { display: flex; gap: 2px; margin-left: 8px; padding: 2px; border-radius: 999px; border: 1px solid var(--sf-border); background: var(--sf-sunken); }
.sf-as-tab { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 500; color: var(--sf-muted); background: transparent; cursor: pointer; }
.sf-as-tab.is-active { color: var(--sf-text); background: var(--sf-elevated); box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 0 0 1px var(--sf-border); }
.sf-as-spacer { flex: 1; }
.sf-as-dialect { font: inherit; font-size: 11px; font-weight: 500; color: var(--sf-muted); background: transparent; border: 0; }
.sf-org-picker { font: inherit; font-size: 11px; font-weight: 500; color: var(--sf-muted); background: transparent; border: 1px solid var(--sf-border); border-radius: 6px; height: 28px; max-width: 240px; padding: 0 6px; }
.sf-as-save { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--sf-border); background: transparent; color: var(--sf-muted); font-size: 12px; font-weight: 600; cursor: pointer; }
.sf-as-save.is-dirty { background: var(--sf-accent); border-color: transparent; color: var(--sf-on-accent); }
.sf-as-save:disabled { opacity: .45; cursor: default; }
.sf-as-banner { padding: 6px 16px; font-size: 12px; color: var(--sf-muted); border-bottom: 1px solid var(--sf-border); }
.sf-as-banner.is-error { color: var(--sf-danger); }
.sf-as-body { display: flex; flex: 1; min-height: 0; }
.sf-as-explorer { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--sf-sunken); border-right: 1px solid var(--sf-border); color: var(--sf-text); }
.sf-as-explorer.is-collapsed { width: 36px; }
.sf-as-explorer-head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 6px; }
.sf-as-explorer-title { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--sf-muted); flex: 1; }
.sf-as-explorer-toggle, .sf-as-tree-btn { border: 0; background: transparent; color: inherit; cursor: pointer; }
.sf-as-explorer-toggle { width: 22px; height: 22px; border-radius: 6px; color: var(--sf-muted); }
.sf-as-explorer-search { margin: 0 8px 8px; font: inherit; font-size: 12px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--sf-border); background: var(--sf-elevated); color: var(--sf-text); }
.sf-as-explorer-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 6px 10px; }
.sf-as-section { margin-bottom: 8px; }
.sf-as-section-label { font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--sf-muted); padding: 4px 6px; }
.sf-as-tree-btn { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; border-radius: 6px; padding: 4px 6px; font-size: 12px; color: var(--sf-text); }
.sf-as-tree-btn:hover { background: var(--sf-elevated); }
.sf-as-tree-btn.is-active { background: color-mix(in srgb, var(--sf-accent) 18%, transparent); box-shadow: inset 2px 0 0 var(--sf-accent); }
.sf-as-tree-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-as-tree-meta { margin-left: auto; font-size: 10px; color: var(--sf-muted); }
.sf-as-empty { padding: 8px 10px; font-size: 12px; color: var(--sf-muted); }
.sf-as-stage { flex: 1; min-width: 0; min-height: 0; display: flex; }
`;

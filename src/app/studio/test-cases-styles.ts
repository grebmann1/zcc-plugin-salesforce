import { TEST_WORKSPACE_STYLES } from './test-workspace-styles.js';
import { STUDIO_RESIZE_STYLES } from './StudioResize.js';
export const TEST_CASES_STYLES = `
${STUDIO_RESIZE_STYLES}
.sf-cases { flex:1; display:grid; grid-template-columns:minmax(0,calc((100% - 9px) * var(--sf-pane-ratio,36) / 100)) 9px minmax(0,1fr); min-height:0; min-width:0; overflow:hidden; border:1px solid var(--sf-border); border-radius:8px; }
.sf-cases-catalogue,.sf-cases-detail { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; }
.sf-cases-catalogue { border-right:1px solid var(--sf-border); }
.sf-cases-search { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:12px; border-bottom:1px solid var(--sf-border); flex-shrink:0; }
.sf-cases-search input,.sf-cases-search select { min-height:34px; min-width:0; max-width:100%; box-sizing:border-box; border:1px solid var(--sf-border); border-radius:6px; padding:6px 8px; background:var(--sf-bg); color:var(--sf-text); font:inherit; }
.sf-cases-search input { flex:1 1 150px; width:100%; }
.sf-cases-search .sf-cases-filter { display:inline-flex; align-items:center; justify-content:space-between; gap:12px; flex:1 1 110px; min-height:34px; border:1px solid var(--sf-border); border-radius:6px; padding:6px 8px; background:var(--sf-bg); color:var(--sf-text); font:inherit; cursor:pointer; }
.sf-cases-rows { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:6px; }
.sf-cases-row { display:flex; flex-direction:column; gap:7px; width:100%; box-sizing:border-box; padding:12px; border:1px solid transparent; border-bottom-color:var(--sf-border); border-radius:6px; background:transparent; color:var(--sf-text); font:inherit; text-align:left; cursor:pointer; }
.sf-cases-row:hover { background:var(--sf-soft); }
.sf-cases-row[aria-pressed=true] { background:color-mix(in srgb,var(--sf-accent) 9%,var(--sf-bg)); border-color:var(--sf-accent); box-shadow:inset 3px 0 var(--sf-accent); }
.sf-cases-row-title { display:flex; gap:8px; align-items:flex-start; justify-content:space-between; }
.sf-cases-row-title strong { line-height:1.45; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.sf-cases-opening { color:var(--sf-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.sf-cases-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; color:var(--sf-muted); font-size:11px; }
.sf-cases-badge { display:inline-flex; align-items:center; gap:4px; flex:none; border:1px solid var(--sf-border); border-radius:999px; padding:2px 7px; font-size:11px; font-weight:600; line-height:1.25; white-space:nowrap; color:var(--sf-muted); background:var(--sf-soft); }
.sf-cases-badge.is-pass { color:var(--sf-success); border-color:var(--sf-success); }
.sf-cases-badge.is-fail { color:var(--sf-danger); border-color:var(--sf-danger); }
.sf-cases-badge.is-stopped,.sf-cases-badge.is-setup,.sf-cases-badge.is-inconclusive { color:var(--sf-warning,#9b650b); border-color:currentColor; }
.sf-cases-badge.is-running { color:var(--sf-accent); border-color:currentColor; }
.sf-cases-hint { flex-shrink:0; padding:10px 12px; margin:0; border-top:1px solid var(--sf-border); color:var(--sf-muted); font-size:11px; }
.sf-cases-detail-head { flex-shrink:0; padding:16px 18px 0; border-bottom:1px solid var(--sf-border); }
.sf-cases-detail-head h3 { margin:10px 0 14px; font-size:16px; line-height:1.4; overflow-wrap:anywhere; }
.sf-cases-run { background:var(--sf-accent); border-color:var(--sf-accent); color:var(--sf-on-accent,#fff); font-weight:600; min-height:34px; }
.sf-cases-tabs { display:flex; gap:8px; margin-top:12px; overflow:auto; }
.sf-cases-tabs button { border:0; border-bottom:3px solid transparent; background:transparent; color:var(--sf-muted); padding:10px 8px; font:inherit; cursor:pointer; white-space:nowrap; }
.sf-cases-tabs button[aria-selected=true] { border-color:var(--sf-accent); color:var(--sf-accent); font-weight:600; }
.sf-cases-content { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:18px; line-height:1.6; overflow-wrap:anywhere; }
.sf-cases-content h4 { font-size:12px; margin:22px 0 8px; }
.sf-cases-content h4:first-child { margin-top:0; }
.sf-cases-content p { margin:6px 0 12px; white-space:pre-wrap; }
.sf-cases-callout { padding:12px; margin-bottom:16px; border:1px solid var(--sf-border); border-radius:8px; background:var(--sf-soft); }
.sf-cases-callout p:last-child { margin-bottom:0; }
.sf-cases-callout.is-stopped,.sf-cases-callout.is-inconclusive { border-color:var(--sf-warning,#9b650b); background:color-mix(in srgb,var(--sf-warning,#9b650b) 5%,var(--sf-bg)); }
.sf-cases-callout.is-fail { border-color:var(--sf-danger); }
.sf-cases-checks { padding:0; list-style:none; }
.sf-cases-checks li { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid var(--sf-border); }
.sf-cases-checks p { color:var(--sf-muted); margin-bottom:0; }
.sf-cases-check-mark { flex:none; font-weight:700; color:var(--sf-muted); }
.sf-cases-check-mark.is-ok { color:var(--sf-success); }.sf-cases-check-mark.is-ko { color:var(--sf-danger); }
.sf-cases-message,.sf-cases-bubble { border:1px solid var(--sf-border); border-radius:8px; padding:12px; white-space:pre-wrap; }
.sf-cases-bubble { max-width:90%; margin-bottom:14px; }.sf-cases-bubble.is-user { margin-left:auto; background:var(--sf-soft); }.sf-cases-bubble strong { color:var(--sf-muted); font-size:11px; }.sf-cases-bubble p { margin-bottom:0; }
.sf-cases-technical { margin:16px 0 0; border:1px solid var(--sf-border); border-radius:7px; }
.sf-cases-technical > summary { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; font-weight:600; min-height:36px; box-sizing:border-box; list-style:none; }
.sf-cases-technical > summary::-webkit-details-marker { display:none; }
.sf-cases-technical > summary::before { content:'›'; color:var(--sf-muted); font-size:16px; line-height:1; }
.sf-cases-technical[open] > summary::before { transform:rotate(90deg); }
.sf-cases-count { margin-left:auto; color:var(--sf-muted); font-size:11px; font-weight:400; }
.sf-cases-disclosure-body { padding:0 12px 12px; }
.sf-cases-disclosure-body .sf-cases-checks { margin:0 0 12px; }
.sf-cases-checks li li { display:list-item; border:0; padding:2px 0; }
.sf-cases-facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr)); gap:12px; padding:10px; margin:0; background:var(--sf-soft); border-radius:5px; font-size:11px; }
.sf-cases-facts dt { color:var(--sf-muted); }.sf-cases-facts dd { margin:2px 0 0; }
.sf-cases-utterances { padding-left:22px; }.sf-cases-utterances li { padding:6px; white-space:pre-wrap; }
.sf-cases-secondary-results { border-top:1px solid var(--sf-border); margin-top:18px; }
.sf-cases-footer { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; padding:10px 14px; border-top:1px solid var(--sf-border); flex-shrink:0; }
.sf-cases-remove { display:inline-flex; align-items:center; justify-content:center; flex:none; margin-left:auto; width:28px; height:28px; padding:0; border:1px solid transparent; border-radius:5px; color:var(--sf-muted); background:transparent; cursor:pointer; }
.sf-cases-remove:hover:not(:disabled) { color:var(--sf-danger); background:color-mix(in srgb,var(--sf-danger) 7%,transparent); }
.sf-cases-remove:disabled { opacity:.4; cursor:default; }
.sf-cases-footer > .sf-tp-btn { min-height:30px; white-space:normal; }
.sf-cases-back { display:none; margin-bottom:12px; }
.sf-cases button:focus-visible,.sf-cases summary:focus-visible,.sf-cases input:focus-visible,.sf-cases select:focus-visible,.sf-cases [tabindex]:focus-visible { outline:2px solid var(--sf-accent); outline-offset:-2px; }
.sf-cases .sf-cases-detail-head h3:focus { outline:none; }
@container (max-width:450px) { .sf-cases-tabs { gap:2px; }.sf-cases-tabs button { font-size:11px; padding:10px 4px; } }
@container (max-width:760px) { .sf-cases { grid-template-columns:minmax(0,1fr); }.sf-cases-catalogue { border:0; }.sf-cases-detail { display:none; }.sf-cases.has-selection .sf-cases-catalogue { display:none; }.sf-cases.has-selection .sf-cases-detail { display:flex; }.sf-cases-back { display:inline-flex; }.sf-cases-detail-head { padding:12px 12px 0; }.sf-cases-content { padding:12px; } }
${TEST_WORKSPACE_STYLES}
`;

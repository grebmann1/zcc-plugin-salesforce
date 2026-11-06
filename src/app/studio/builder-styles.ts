/** Q4 Builder's neutral surfaces, compact typography and blue selection, scoped to Studio. */
export const BUILDER_STUDIO_STYLES = `
.sf-as { --sf-builder-primary:var(--sf-text); --sf-builder-on-primary:var(--sf-bg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
html[data-theme=light] .sf-as, html[data-theme=light] .sf-studio { --sf-bg:#fff; --sf-surface:#fff; --sf-elevated:#fafafa; --sf-sunken:#f3f3f3; --sf-text:#181818; --sf-muted:#686868; --sf-border:#e5e5e5; --sf-accent:#0176d3; --sf-soft:#edf4ff; }
.sf-as :is(h1,h2,h3,h4,strong,.af-document-name,.sf-atab-label,.sf-etab-label) { font-weight:500; }
.sf-as .af-document-bar { min-height:58px; padding:12px 18px; background:var(--sf-surface); }
.sf-as .af-document-icon { background:var(--sf-builder-primary); color:var(--sf-builder-on-primary); }
.sf-as .sf-as-save { min-height:30px; border-radius:8px; font-weight:400; }
.sf-as .sf-as-save:is(.is-dirty,.is-primary),.sf-builder-primary { background:var(--sf-builder-primary); color:var(--sf-builder-on-primary); border-color:var(--sf-builder-primary); }
.sf-as .sf-as-explorer { background:var(--sf-surface); }
.sf-as .sf-as-explorer-head { padding:16px 12px 12px; }
.sf-as .sf-as-tree-btn { border-radius:6px; min-height:30px; }
.sf-as .sf-as-tree-btn.is-active { background:var(--sf-soft); color:var(--sf-accent); box-shadow:none; }
.sf-as .sf-as-section-label { font-size:11px; font-weight:500; letter-spacing:.02em; }
.sf-as .sf-etabs,.sf-as .sf-agent-tabs { background:var(--sf-elevated); }
.sf-as .af-tool-picker { padding:0; }
.sf-builder-launcher { position:relative; }
.sf-builder-launcher>.sf-as-save { display:inline-flex; align-items:center; justify-content:center; gap:6px; color:var(--sf-text); }
.sf-builder-menu { position:absolute; z-index:90; top:calc(100% + 8px); right:0; width:min(590px,calc(100vw - 80px)); max-height:min(660px,75vh); overflow:auto; border:1px solid var(--sf-border); border-radius:10px; background:var(--sf-surface); box-shadow:0 10px 32px color-mix(in srgb,var(--sf-text) 16%,transparent); text-align:left; }
.sf-builder-picker { padding:20px; color:var(--sf-text); font-size:12px; }
.sf-builder-picker h2,.sf-builder-header h2 { margin:0; font-size:18px; font-weight:500; }
.sf-builder-picker p,.sf-builder-header p { color:var(--sf-muted); line-height:1.6; font-size:12px; margin:6px 0 16px; }
.sf-builder-picker input,.sf-builder-tool :is(input:not([type=checkbox]):not([type=file]),textarea) { box-sizing:border-box; width:100%; padding:8px 10px; border:1px solid var(--sf-border); border-radius:8px; background:var(--sf-surface); color:var(--sf-text); font:inherit; min-width:0; }
.sf-builder-catalog { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr)); gap:8px; margin-top:16px; }
.sf-builder-catalog>button { display:flex; align-items:flex-start; gap:12px; text-align:left; border:1px solid var(--sf-border); border-radius:8px; color:var(--sf-text); background:var(--sf-surface); padding:14px 12px; cursor:pointer; min-width:0; font:inherit; }
.sf-builder-catalog>button:hover { background:var(--sf-sunken); border-color:var(--sf-muted); }
.sf-builder-catalog>button>svg { flex:none; margin-top:2px; color:var(--sf-muted); }
.sf-builder-catalog>button>span:nth-child(2) { flex:1; min-width:0; }
.sf-builder-catalog strong { display:block; font-size:12px; font-weight:500; }
.sf-builder-catalog small { display:block; color:var(--sf-muted); font-size:11px; line-height:1.6; margin-top:5px; }
.sf-builder-origin { font-size:9px; color:var(--sf-muted); white-space:nowrap; }
.sf-builder-tool { display:flex; flex:1; flex-direction:column; height:100%; min-height:0; min-width:0; background:var(--sf-surface); color:var(--sf-text); font-size:13px; container-type:inline-size; }
.sf-builder-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:16px; border-bottom:1px solid var(--sf-border); flex:none; }
.sf-builder-context { display:flex; gap:7px; align-items:center; padding:8px 16px; font-size:10px; border-bottom:1px solid var(--sf-border); color:var(--sf-muted); flex-wrap:wrap; flex:none; }
.sf-builder-context strong { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--sf-text); }
.sf-builder-dot { width:6px; height:6px; background:var(--sf-muted); border-radius:50%; }
.sf-builder-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:20px; user-select:text; -webkit-user-select:text; }
.sf-builder-body>h3 { font-size:13px; margin:20px 0 14px; }
.sf-builder-body p { line-height:1.7; overflow-wrap:anywhere; }
.sf-builder-tool button,.sf-builder-header button { font:inherit; border:1px solid var(--sf-border); border-radius:8px; background:var(--sf-surface); color:var(--sf-text); padding:6px 10px; min-height:32px; cursor:pointer; line-height:1.5; }
.sf-builder-tool button:disabled { opacity:.5; cursor:default; }
.sf-builder-tool button:not(:disabled):not(.sf-builder-primary):hover { background:var(--sf-sunken); }
.sf-builder-tool button.sf-builder-primary { background:var(--sf-builder-primary); color:var(--sf-builder-on-primary); border-color:var(--sf-builder-primary); }
.sf-builder-tool button.sf-builder-primary:not(:disabled):hover { background:color-mix(in srgb,var(--sf-builder-primary) 90%,var(--sf-surface)); }
.sf-builder-tool button[aria-pressed=true] { background:var(--sf-soft); color:var(--sf-accent); }
.sf-builder-tool :is(input,textarea,button):focus-visible,.sf-builder-picker :is(input,button):focus-visible { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-builder-tool label { display:flex; flex-direction:column; gap:7px; margin-bottom:16px; font-weight:500; }
.sf-builder-tool label input,.sf-builder-tool label textarea { font-weight:400; }
.sf-builder-tool textarea { resize:vertical; line-height:1.6; }
.sf-builder-filters { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:12px 0 18px; }
.sf-builder-filters>input { flex:1 1 180px; }
.sf-builder-tool .sf-builder-filters>.sf-builder-picklist { width:auto; max-width:100%; }
.sf-builder-note { color:var(--sf-muted); font-size:11px; }
.sf-builder-tool .sf-builder-row { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; text-align:left; padding:13px 0; border:0; border-bottom:1px solid var(--sf-border); border-radius:0; background:transparent; min-width:0; }
.sf-builder-row>span:first-child { min-width:0; overflow-wrap:anywhere; }
.sf-builder-row strong,.sf-builder-shortcut strong { display:block; font-weight:500; }
.sf-builder-row small,.sf-builder-shortcut small { display:block; color:var(--sf-muted); font-size:10px; margin-top:5px; }
.sf-builder-pill { display:inline-flex; align-items:center; padding:2px 6px; border-radius:5px; font-size:10px; border:1px solid var(--sf-border); color:var(--sf-muted); white-space:nowrap; font-weight:400; }
.sf-builder-pill[data-status=pass] { color:var(--sf-success); background:color-mix(in srgb,var(--sf-success) 7%,transparent); }
.sf-builder-pill:is([data-status=fail],[data-status=error]) { color:var(--sf-danger); background:color-mix(in srgb,var(--sf-danger) 7%,transparent); }
.sf-builder-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:20px 0; }
.sf-builder-metrics>div { border:1px solid var(--sf-border); border-radius:8px; padding:16px; }
.sf-builder-metrics small { display:block; font-size:10px; color:var(--sf-muted); margin-bottom:12px; }
.sf-builder-metrics strong { font-size:24px; font-weight:500; }
.sf-builder-bars>div { display:flex; align-items:center; gap:10px; margin:14px 0; }
.sf-builder-bars span { flex:1; font-size:11px; }
.sf-builder-bars meter { width:38%; height:8px; appearance:none; -webkit-appearance:none; background:var(--sf-sunken); border-radius:4px; overflow:hidden; --sf-meter-color:var(--sf-muted); }
.sf-builder-bars meter[data-outcome=pass] { --sf-meter-color:var(--sf-success); }
.sf-builder-bars meter[data-outcome=fail] { --sf-meter-color:var(--sf-danger); }
.sf-builder-bars meter::-webkit-meter-bar { height:8px; border:0; border-radius:4px; background:var(--sf-sunken); }
.sf-builder-bars meter::-webkit-meter-optimum-value { border-radius:4px; background:var(--sf-meter-color); }
.sf-builder-bars meter::-moz-meter-bar { background:var(--sf-meter-color); }
.sf-builder-card { border:1px solid var(--sf-border); border-radius:8px; padding:16px; margin:14px 0; }
.sf-builder-card h3 { font-size:13px; font-weight:500; margin:12px 0; }
.sf-builder-card p { color:var(--sf-muted); font-size:11px; }
.sf-builder-empty { text-align:center; padding:35px 14px; color:var(--sf-muted); }
.sf-builder-empty h3 { color:var(--sf-text); font-weight:500; font-size:14px; }
.sf-builder-error { border:1px solid var(--sf-danger); border-radius:8px; color:var(--sf-danger); padding:12px; margin-bottom:14px; font-size:12px; }
.sf-builder-message { background:var(--sf-sunken); border:1px solid var(--sf-border); border-radius:10px; margin:12px 0; padding:12px 14px; }
.sf-builder-message[data-role=agent] { background:var(--sf-surface); }
.sf-builder-message small { color:var(--sf-muted); font-size:10px; }
.sf-builder-message p { margin:7px 0 0; white-space:pre-wrap; }
.sf-builder-file,.sf-builder-diff pre,.sf-builder-diff-split pre { white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; font-size:11px; line-height:1.7; font-family:Monaco,Menlo,monospace; }
.sf-builder-file { border:1px solid var(--sf-border); border-radius:8px; padding:14px; background:var(--sf-sunken); min-width:0; }
.sf-builder-diff { border:1px solid var(--sf-border); border-radius:8px; overflow:hidden; margin:16px 0; }
.sf-builder-diff pre { padding:0; margin:0; }
.sf-builder-diff span { display:block; padding:0 10px; white-space:pre-wrap; }
.sf-builder-diff [data-change=add] { background:color-mix(in srgb,var(--sf-success) 9%,transparent); color:var(--sf-success); }
.sf-builder-diff [data-change=del] { background:color-mix(in srgb,var(--sf-danger) 8%,transparent); color:var(--sf-danger); }
.sf-builder-gap { padding:8px 10px; background:var(--sf-sunken); color:var(--sf-muted); font-size:10px; }
.sf-builder-diff-split { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1px; background:var(--sf-border); border:1px solid var(--sf-border); border-radius:8px; margin:16px 0; overflow:hidden; }
.sf-builder-diff-split pre { margin:0; padding:12px; background:var(--sf-surface); min-width:0; }
.sf-builder-tool label.sf-builder-upload { position:relative; display:inline-flex; flex-direction:row; align-items:center; gap:8px; margin:0; padding:6px 10px; min-height:32px; box-sizing:border-box; border:1px solid var(--sf-border); border-radius:8px; font-size:12px; font-weight:400; cursor:pointer; }
.sf-builder-upload input { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip-path:inset(50%); }
.sf-builder-upload:focus-within { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-builder-upload[aria-disabled=true] { opacity:.5; cursor:default; }
.sf-builder-upload:not([aria-disabled=true]):hover { background:var(--sf-sunken); }
.sf-builder-tool .sf-builder-shortcut { border:0; text-align:left; padding:0; flex:1; }
.sf-builder-tool .sf-builder-setting { flex-direction:row; align-items:center; justify-content:space-between; padding:16px 0; border-bottom:1px solid var(--sf-border); font-weight:400; }
.sf-builder-setting input { accent-color:var(--sf-text); width:16px; height:16px; }
.sf-builder-experiment-setup { border-bottom:1px solid var(--sf-border); margin-bottom:16px; }
.sf-builder-experiment-setup > summary { display:flex; align-items:center; gap:10px; padding:10px 0; list-style:none; cursor:pointer; }
.sf-builder-experiment-setup > summary::-webkit-details-marker { display:none; }
.sf-builder-experiment-setup > summary::before { content:'›'; font-size:18px; color:var(--sf-muted); }
.sf-builder-experiment-setup[open] > summary::before { transform:rotate(90deg); }
.sf-builder-experiment-setup > summary strong { flex:1; font-weight:500; }
.sf-builder-experiment-setup > summary span { color:var(--sf-muted); font-size:11px; }
.sf-builder-experiment-setup > summary span[data-required=true] { color:var(--sf-warning,var(--sf-muted)); }
.sf-builder-experiment-setup > div { padding:0 0 12px; }
.sf-builder-experiment-setup > summary:focus-visible { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-builder-prerequisites { min-width:0; margin:18px 0; padding:12px 14px 0; border:1px solid var(--sf-border); border-radius:8px; }
.sf-builder-prerequisites legend { padding:0 5px; font-size:12px; font-weight:500; }
.sf-builder-prerequisites>p { margin:0; color:var(--sf-muted); font-size:11px; }
.sf-builder-prerequisites .sf-builder-setting { gap:14px; margin:0; }
.sf-builder-prerequisites .sf-builder-setting:last-child { border-bottom:0; }
.sf-builder-prerequisites .sf-builder-setting>span { min-width:0; overflow-wrap:anywhere; }
.sf-builder-prerequisites input { flex:none; }
.sf-builder-prerequisites ul { padding-left:18px; margin:6px 0 0; font-size:11px; color:var(--sf-muted); line-height:1.6; }
@container (max-width:600px) { .sf-builder-diff-split { grid-template-columns:minmax(0,1fr); } }
@container (max-width:450px) { .sf-builder-header { padding:14px; } .sf-builder-body { padding:14px; } .sf-builder-catalog { grid-template-columns:1fr; } .sf-builder-metrics strong { font-size:20px; } .sf-builder-menu { right:-60px; width:min(360px,calc(100vw - 40px)); } }

.sf-builder-header-text { min-width:0; flex:1 1 180px; }
.sf-builder-header h2 { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.3; }
.sf-builder-header p { margin:3px 0 0; line-height:1.4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-builder-header-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; max-width:100%; }
.sf-builder-tool button,.sf-builder-header-actions>button { display:inline-flex; align-items:center; justify-content:center; gap:6px; transition:border-color .12s; }
.sf-builder-tool .sf-builder-back { padding:0; min-height:24px; border:0; background:transparent; color:var(--sf-accent); font-size:12px; justify-content:flex-start; }
.sf-builder-tool .sf-builder-back:hover { text-decoration:underline; background:transparent; }
.sf-builder-header .sf-builder-icon-button,.sf-builder-tool .sf-builder-icon-button { width:32px; min-width:32px; height:32px; padding:0; flex:none; }
.sf-builder-header button:hover:not(:disabled) { background:var(--sf-sunken); }
.sf-builder-header button.sf-builder-primary:hover:not(:disabled) { background:color-mix(in srgb,var(--sf-builder-primary) 90%,var(--sf-surface)); }
.sf-builder-header button:focus-visible { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-builder-header button:disabled { opacity:.5; cursor:default; }
.sf-builder-tool button.sf-builder-danger { color:var(--sf-danger); }
.sf-builder-tool button.sf-builder-danger:hover:not(:disabled) { background:color-mix(in srgb,var(--sf-danger) 6%,var(--sf-surface)); }
.sf-builder-tool .sf-builder-row { justify-content:space-between; }
.sf-builder-body>:first-child { margin-top:0; }
.sf-builder-result-count { margin:8px 0; font-size:12px; color:var(--sf-muted); }
.sf-builder-list { border-top:1px solid var(--sf-border); }
.sf-builder-list .sf-builder-row { padding:14px 10px; }
.sf-builder-list .sf-builder-row strong { color:var(--sf-accent); font-size:13px; }
.sf-builder-card { margin:0 0 20px; }
.sf-builder-card h3 { margin:0 0 8px; font-size:14px; }
.sf-builder-card p { margin:8px 0; font-size:12px; }
.sf-builder-section-heading { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
.sf-builder-section-heading h3 { margin:0; }
.sf-builder-score-counts { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:5px; }
.sf-builder-score-preview { margin:20px 0; border-top:1px solid var(--sf-border); padding-top:12px; }
.sf-builder-score-preview>summary { cursor:pointer; font-size:12px; padding:8px 0; }
.sf-builder-score-preview>summary:focus-visible { outline:2px solid var(--sf-accent); outline-offset:2px; }
.sf-builder-form-fields { padding:0; margin:0; border:0; min-width:0; }
.sf-builder-form-fields label { margin-bottom:20px; }
.sf-builder-form-fields input,.sf-builder-form-fields textarea { font-weight:400; }
.sf-builder-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr)); gap:12px; }
.sf-builder-tool .sf-builder-scorer-card { display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:6px; text-align:left; min-width:0; min-height:140px; padding:14px; border:1px solid var(--sf-border); border-radius:8px; background:var(--sf-surface); box-sizing:border-box; margin:0; overflow-wrap:anywhere; }
.sf-builder-scorer-card>strong { font-size:14px; font-weight:500; }
.sf-builder-scorer-card>span { color:var(--sf-muted); font-size:12px; line-height:1.5; }
.sf-builder-scorer-card>small { margin-top:auto; padding-top:12px; display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.sf-builder-scorer-card .sf-builder-pill { background:var(--sf-sunken); font-family:Monaco,Menlo,monospace; }
.sf-builder-tool label.sf-builder-range { display:flex; flex-direction:row; align-items:center; gap:8px; font-weight:400; font-size:11px; color:var(--sf-muted); margin:0; }
.sf-builder-tool .sf-builder-range .sf-builder-picklist { width:auto; max-width:180px; font-size:12px; }
.sf-builder-segment { display:flex; flex-wrap:wrap; border:1px solid var(--sf-border); border-radius:8px; padding:2px; }
.sf-builder-segment button { border:0; background:transparent; min-height:28px; border-radius:6px; }
.sf-builder-segment button[aria-pressed=true] { background:var(--sf-soft); color:var(--sf-accent); }
.sf-builder-comparison-labels { display:flex; align-items:center; gap:12px; font-weight:500; }
.sf-builder-diff-summary { display:flex; flex-wrap:wrap; gap:12px; font-size:12px; }
.sf-builder-diff-summary>span:first-child { color:var(--sf-success); }
.sf-builder-diff-summary>span:last-child { color:var(--sf-danger); }
.sf-builder-diff-split>div { min-width:0; background:var(--sf-surface); }
.sf-builder-diff-split h3 { font-size:12px; font-weight:500; margin:0; padding:10px 12px; border-bottom:1px solid var(--sf-border); background:var(--sf-sunken); }
.sf-builder-setting>span { min-width:0; line-height:1.5; }
.sf-builder-setting small { display:block; margin-top:4px; font-size:11px; line-height:1.5; color:var(--sf-muted); font-weight:400; }
.sf-builder-setting input { flex:none; }
.sf-builder-card .sf-builder-setting:last-child { border-bottom:0; padding-bottom:0; margin-bottom:0; }
.sf-builder-tool kbd { padding:3px 7px; border:1px solid var(--sf-border); border-radius:4px; background:var(--sf-sunken); font:11px Monaco,Menlo,monospace; white-space:nowrap; }
.sf-builder-error,.sf-builder-notice { display:flex; align-items:center; justify-content:space-between; gap:10px; overflow-wrap:anywhere; }
.sf-builder-error>span,.sf-builder-notice>span { min-width:0; }
.sf-builder-error button { flex:none; }
.sf-builder-notice { padding:10px 12px; border:1px solid var(--sf-border); border-radius:8px; background:var(--sf-soft); margin-bottom:16px; font-size:12px; }
.sf-builder-loading { color:var(--sf-muted); font-size:12px; }
.sf-builder-tool .sf-builder-code-input { font-family:Monaco,Menlo,monospace; }
@container (max-width:450px) {
  .sf-builder-header:has(>.sf-builder-header-actions>.sf-builder-icon-button:only-child) { flex-wrap:nowrap; }
  .sf-builder-header:has(>.sf-builder-header-actions>.sf-builder-icon-button:only-child) .sf-builder-header-text { flex:1 1 auto; }
  .sf-builder-header:has(>.sf-builder-header-actions>.sf-builder-icon-button:only-child) .sf-builder-header-actions { width:auto; flex:none; }
  .sf-builder-header-text { flex-basis:100%; }
  .sf-builder-header-actions { width:100%; }
  .sf-builder-header-actions>.sf-builder-icon-button:last-child { margin-left:auto; }
  .sf-builder-diff-split { grid-template-columns:minmax(0,1fr); }
  .sf-builder-range { flex:1; }
  .sf-builder-tool .sf-builder-range .sf-builder-picklist { flex:1; max-width:none; }
  .sf-builder-setting { gap:14px; }
}
.sf-builder-tool button.sf-builder-picklist { box-sizing:border-box; justify-content:space-between; width:100%; max-width:100%; min-width:0; min-height:34px; padding:7px 10px; line-height:18px; text-align:left; font-weight:400; }
.sf-builder-suite-option>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-builder-suite-option>svg { flex:none; }
.sf-builder-picklist>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-builder-picklist>svg { flex:none; color:var(--sf-muted); }
.sf-builder-tool button.sf-builder-picklist[aria-expanded=true] { border-color:var(--sf-accent); background:var(--sf-soft); }
@media (prefers-reduced-motion:reduce) { .sf-builder-tool button { transition:none; } }
`;

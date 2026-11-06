/** Shared by Evals and Experiments; each host supplies a single scrolling workspace. */
export const SUITE_COMPARISON_STYLES = `
.sf-comparison { min-width:0; color:var(--sf-text); font-size:12px; line-height:1.6; }
.sf-comparison h3 { font-size:16px; font-weight:500; margin:0 0 4px; }
.sf-comparison p { margin:0; }
.sf-comparison-subtitle { color:var(--sf-muted); }
.sf-comparison-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:20px 0 12px; }
.sf-comparison-metric { border:1px solid var(--sf-border); border-radius:8px; padding:14px 16px; }
.sf-comparison-metric span,.sf-comparison-metric small { display:block; color:var(--sf-muted); font-size:11px; }
.sf-comparison-metric strong { display:block; font-size:24px; font-weight:500; margin:4px 0; line-height:1.4; }
.sf-comparison-delta { display:flex; flex-wrap:wrap; gap:8px 18px; color:var(--sf-muted); margin-bottom:20px; }
.sf-comparison-stale { padding:10px 12px; border:1px solid var(--sf-warning,var(--sf-border)); border-radius:8px; margin:12px 0; }
.sf-comparison-case { border:1px solid var(--sf-border); border-radius:8px; margin:10px 0; overflow:hidden; }
.sf-comparison-case > summary { display:flex; align-items:center; gap:10px; padding:12px 14px; min-height:46px; box-sizing:border-box; list-style:none; cursor:pointer; }
.sf-comparison-case > summary::-webkit-details-marker { display:none; }
.sf-comparison-case > summary::before { content:'›'; color:var(--sf-muted); font-size:18px; flex:none; }
.sf-comparison-case[open] > summary::before { transform:rotate(90deg); }
.sf-comparison-case > summary:focus-visible { outline:2px solid var(--sf-accent); outline-offset:-2px; }
.sf-comparison-case > summary strong { min-width:0; flex:1; font-weight:500; overflow-wrap:anywhere; }
.sf-comparison-outcomes { display:inline-flex; align-items:center; flex-wrap:wrap; gap:5px; flex:none; font-size:10px; color:var(--sf-muted); }
.sf-comparison-outcome { border:1px solid var(--sf-border); border-radius:5px; padding:1px 6px; }
.sf-comparison-outcome[data-outcome=pass] { color:var(--sf-success); background:color-mix(in srgb,var(--sf-success) 6%,transparent); }
.sf-comparison-outcome[data-outcome=fail] { color:var(--sf-danger); background:color-mix(in srgb,var(--sf-danger) 6%,transparent); }
.sf-comparison-replies { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); border-top:1px solid var(--sf-border); }
.sf-comparison-side { padding:16px; min-width:0; overflow-wrap:anywhere; }
.sf-comparison-side + .sf-comparison-side { border-left:1px solid var(--sf-border); }
.sf-comparison-side h4 { font-size:11px; font-weight:500; color:var(--sf-muted); margin:0 0 10px; }
.sf-comparison .sf-comparison-reply { white-space:pre-wrap; }
.sf-comparison-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; border-top:1px solid var(--sf-border); padding-top:12px; margin:18px 0 0; font-size:11px; }
.sf-comparison-facts dt { color:var(--sf-muted); }.sf-comparison-facts dd { margin:4px 0 0; }
.sf-comparison .sf-comparison-note { margin-top:10px; color:var(--sf-muted); font-size:11px; }
.sf-comparison-about { margin-top:20px; color:var(--sf-muted); font-size:11px; }
.sf-comparison-about > summary { cursor:pointer; padding:8px 0; color:var(--sf-text); }
.sf-comparison-about p { margin:8px 0; }.sf-comparison-about small { overflow-wrap:anywhere; }
@container (max-width:600px) { .sf-comparison-replies { grid-template-columns:minmax(0,1fr); }.sf-comparison-side + .sf-comparison-side { border-left:0; border-top:1px solid var(--sf-border); }.sf-comparison-case > summary { flex-wrap:wrap; }.sf-comparison-case > summary strong { flex-basis:calc(100% - 28px); }.sf-comparison-outcomes { margin-left:20px; }.sf-comparison-metric { padding:12px; } }
`;

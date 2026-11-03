/** Shared catalogue/detail chrome for saved cases and editable customer scenarios. */
export const TEST_WORKSPACE_STYLES = `
.sf-tests-workspace{flex:1;min-height:240px;min-width:0;border-radius:10px;background:var(--sf-bg)}
.sf-tests-workspace :is(.sf-cases-catalogue,.sf-sim-catalogue){background:color-mix(in srgb,var(--sf-sunken) 42%,var(--sf-bg));min-height:0;overflow:hidden}
.sf-tests-workspace :is(.sf-cases-row,.sf-sim-scenario){border-radius:7px;padding:12px;border:1px solid transparent;border-bottom-color:var(--sf-border)}
.sf-tests-workspace :is(.sf-cases-row[aria-pressed=true],.sf-sim-scenario.is-active){background:var(--sf-soft);border-color:var(--sf-accent);box-shadow:inset 3px 0 var(--sf-accent)}
.sf-tests-workspace :is(.sf-cases-row-title strong,.sf-sim-scenario strong){font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.sf-tests-workspace :is(.sf-cases-opening,.sf-sim-scenario span){font-size:11px;line-height:1.5;color:var(--sf-muted)}
.sf-tests-workspace :is(.sf-cases-detail-head,.sf-sim-editor-head){padding:16px 18px 0;border-bottom:1px solid var(--sf-border);flex-shrink:0}
.sf-tests-workspace :is(.sf-cases-content,.sf-sim-editor-body){padding:18px;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.sf-tests-workspace :is(.sf-cases-footer,.sf-sim-detail-footer){padding:12px 16px;border-top:1px solid var(--sf-border);flex-shrink:0}
.sf-tests-workspace :is(.sf-cases-tabs button,.sf-tp-btn){min-height:32px}
.sf-tests-workspace .sf-cases-tabs{display:flex;gap:8px;margin-top:12px;overflow:auto}
.sf-tests-workspace .sf-cases-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;color:var(--sf-muted);padding:10px 8px;font:inherit;cursor:pointer;white-space:nowrap}
.sf-tests-workspace .sf-cases-tabs button[aria-selected=true]{border-color:var(--sf-accent);color:var(--sf-accent);font-weight:600}
.sf-sim-workspace .sf-sim-catalogue{padding:12px 0 0;gap:10px}
.sf-sim-catalogue>:not(.sf-sim-scenarios){margin-left:12px;margin-right:12px}
.sf-sim-catalogue .sf-sim-scenarios{flex:1;min-height:0;max-height:none;padding:6px;gap:0;overscroll-behavior:contain}
.sf-sim-catalogue .sf-sim-add{margin-top:0;margin-bottom:12px}
.sf-sim-selection{display:flex;flex-direction:column;gap:8px}.sf-sim-selection>div{display:flex;gap:6px;flex-wrap:wrap}
.sf-sim-catalogue-hint{color:var(--sf-muted);font-size:11px;margin-top:0;margin-bottom:0}
.sf-sim-workspace .sf-sim-editor{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:0;container-type:normal}
.sf-sim-editor-body{flex:1;min-width:0;border:0;margin:0}.sf-sim-editor-head .sf-sim-editor-intro{margin:5px 0 12px}
.sf-sim-editor-head .sf-sim-editor-title>input{font-size:16px;line-height:1.4}
.sf-sim-editor-body .sf-sim-variables:first-child{border-top:0;margin-top:0;padding-top:0}
.sf-sim-back{display:none;margin-bottom:12px}.sf-sim-setup{display:flex;flex-direction:column;flex:1;min-height:0;gap:12px}
.sf-sim-setup-info{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sf-sim-setup-info p{flex:1;min-width:220px;margin:0;color:var(--sf-muted);line-height:1.6;font-size:11px}
.sf-sim-limit{padding:10px 12px;border:1px solid var(--sf-warning,#9b650b);border-radius:8px;color:var(--sf-warning,#9b650b);margin:0;line-height:1.5}
.sf-sim[data-testid=studio-simulations]{flex:1;overflow:hidden}.sf-sim[data-testid=studio-simulations]>:not(.sf-sim-setup):not(.sf-sim-results){flex-shrink:0}
.sf-sim-results{flex:1;min-height:0;overflow:auto}
.sf-scenario-library .sf-scenario-header-actions{flex:0 1 auto;min-width:0}
.sf-tests-view-heading h2{margin:0;font-size:20px;font-weight:650;letter-spacing:-.035em}.sf-tests-view-heading p{margin:5px 0 0;color:var(--sf-muted);font-size:12px}
.sf-tp-cases-view>.sf-tp-bar>.sf-tp-btn{border-radius:8px;padding:7px 12px;line-height:1.4;min-height:34px}
.sf-tp-cases-view>.sf-tp-bar>.sf-tp-btn.is-primary{background:var(--sf-accent);border-color:var(--sf-accent);color:var(--sf-on-accent,#fff)}
.sf-tp-passbar .is-review{background:var(--sf-warning,#9b650b)}
@container (max-width:760px){
 .sf-tests-workspace.sf-sim-workspace{grid-template-columns:minmax(0,1fr)}
 .sf-tests-workspace>.sf-pane-divider{display:none}
 .sf-sim-workspace .sf-sim-editor{display:none}.sf-sim-workspace.has-selection .sf-sim-editor{display:flex}
 .sf-sim-workspace.has-selection .sf-sim-catalogue{display:none}.sf-sim-workspace .sf-sim-catalogue{border:0}
 .sf-sim-workspace .sf-sim-scenarios{max-height:none}.sf-sim-back{display:inline-flex}
 .sf-tests-workspace :is(.sf-cases-detail-head,.sf-sim-editor-head){padding:12px 12px 0}
 .sf-tests-workspace :is(.sf-cases-content,.sf-sim-editor-body){padding:12px}
 .sf-sim-editor-body .sf-sim-fields{grid-template-columns:minmax(0,1fr)}
}
`;

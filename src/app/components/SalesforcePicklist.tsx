import { PopoverPicklist, type PopoverPicklistProps } from '@zana-ai/zcc-ui/popover-picklist';

/** The host's keyboard-accessible, portaled picker with Salesforce field styling. */
export function SalesforcePicklist<T extends string>(props: PopoverPicklistProps<T>) {
  return <>
    <style>{PICKLIST_STYLES}</style>
    <PopoverPicklist {...props} triggerClassName={`sf-picklist ${props.triggerClassName ?? ''}`} />
  </>;
}

/** A portaled menu is still part of its owning settings popover. */
export function containsPicklistTarget(container: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (container.contains(target)) return true;
  return [...container.querySelectorAll('[aria-haspopup="listbox"][aria-controls]')].some(trigger =>
    trigger.ownerDocument.getElementById(trigger.getAttribute('aria-controls')!)?.contains(target));
}

const PICKLIST_STYLES = `
button.sf-picklist{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:32px;padding:6px 9px;border:1px solid var(--sf-border,var(--border));border-radius:8px;background:var(--sf-bg,var(--bg-input,var(--bg-panel)));color:var(--sf-text,var(--text-primary));font:inherit;font-weight:400;line-height:18px;text-align:left;cursor:pointer}
button.sf-picklist:hover:not(:disabled){background:var(--sf-sunken,var(--bg-hover))}
button.sf-picklist[aria-expanded=true]{border-color:var(--sf-accent,var(--accent))}
button.sf-picklist:focus-visible{outline:2px solid var(--sf-accent,var(--accent));outline-offset:2px}
button.sf-picklist:disabled{opacity:.5;cursor:default}
.sf-picklist>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sf-picklist>svg{flex:none;color:var(--sf-muted,var(--text-muted))}
`;

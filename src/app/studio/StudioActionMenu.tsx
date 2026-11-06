import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface StudioMenuAction {
  id: string;
  label: string;
  onSelect(): void;
  disabled?: boolean;
  title?: string;
  group?: string;
}

/** Secondary commands stay discoverable without turning a narrow panel into a button wall. */
export function StudioActionMenu({ label, actions }: { label: string; actions: StudioMenuAction[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const last = useRef(false);
  const dismiss = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const element = popup.current!;
    const bounds = trigger.current!.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    element.style.width = `${width}px`;
    element.style.left = `${Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))}px`;
    if (typeof element.showPopover === 'function') element.showPopover();
    else element.removeAttribute('popover');
    const below = window.innerHeight - bounds.bottom - 14;
    const above = bounds.top - 14;
    const flip = element.scrollHeight > below && above > below;
    element.style.maxHeight = `${Math.max(0, flip ? above : below)}px`;
    element.style.top = `${flip ? Math.max(8, bounds.top - Math.min(element.scrollHeight, above) - 6) : bounds.bottom + 6}px`;
    const items = element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (last.current ? items[items.length - 1] : items[0])?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) dismiss(); };
    const leave = () => dismiss();
    const scroll = (event: Event) => { if (!element.contains(event.target as Node)) dismiss(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('blur', leave);
    window.addEventListener('resize', leave);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('blur', leave);
      window.removeEventListener('resize', leave);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  return <div ref={root} className="sf-action-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dismiss();
  }} onKeyDown={event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(true); }
    if (event.key === 'Tab') dismiss(true);
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[index]?.focus();
  }}>
    <style>{`
.sf-action-menu { display:inline-flex; flex:none; }
.sf-action-menu-short { display:none; }
@container (max-width:420px) { .sf-action-menu-label { display:none; }.sf-action-menu-short { display:inline; } }
.sf-action-menu-trigger { display:inline-flex; align-items:center; justify-content:center; gap:6px; }
.sf-action-menu-popup { position:fixed; inset:auto; margin:0; padding:6px; box-sizing:border-box; overflow:auto; z-index:100; border:1px solid var(--sf-border); border-radius:9px; background:var(--sf-bg); color:var(--sf-text); box-shadow:0 8px 28px #0003; font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.sf-action-menu-popup .sf-action-menu-item { display:block; width:100%; padding:8px 10px; min-height:34px; text-align:left; white-space:normal; border:0; border-radius:5px; background:transparent; color:inherit; font:inherit; cursor:pointer; }
.sf-action-menu-popup .sf-action-menu-item:disabled { opacity:.45; cursor:default; }
.sf-action-menu-popup .sf-action-menu-item:not(:disabled):is(:hover,:focus-visible) { background:var(--sf-soft); outline:none; }
.sf-action-menu-group { padding:8px 10px 4px; font-size:10px; font-weight:500; color:var(--sf-muted); }
.sf-action-menu-popup > div:not(:first-child) > .sf-action-menu-group { margin-top:6px; border-top:1px solid var(--sf-border); }
    `}</style>
    <button ref={trigger} className="sf-tp-btn sf-action-menu-trigger" type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { last.current = false; setOpen(value => !value); }} onKeyDown={event => {
      if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); last.current = event.key === 'ArrowUp'; setOpen(true); }
    }}><span className="sf-action-menu-label">More actions</span><span className="sf-action-menu-short" aria-hidden="true">More</span> <ChevronDown size={13} aria-hidden="true" /></button>
    {open && <div ref={popup} id={id} popover="manual" role="menu" aria-label={label} className="sf-action-menu-popup">
      {actions.map((action, index) => <div key={action.id} role="none">
        {action.group && action.group !== actions[index - 1]?.group && <div className="sf-action-menu-group" role="presentation">{action.group}</div>}
        <button type="button" role="menuitem" tabIndex={-1} className="sf-action-menu-item" disabled={action.disabled} title={action.title} onClick={() => { dismiss(true); action.onSelect(); }}>{action.label}</button>
      </div>)}
    </div>}
  </div>;
}

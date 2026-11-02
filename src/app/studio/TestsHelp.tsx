import { useId, useLayoutEffect, useRef, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';

/** On-demand guidance without taking space from the test case inspector. */
export function TestsHelp({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const dismiss = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const element = popup.current!;
    const bounds = trigger.current!.getBoundingClientRect();
    const width = Math.min(360, Math.max(0, window.innerWidth - 16));
    const top = bounds.bottom + 6;
    element.style.width = `${width}px`;
    element.style.left = `${Math.min(Math.max(8, bounds.left), Math.max(8, window.innerWidth - width - 8))}px`;
    element.style.top = `${top}px`;
    element.style.maxHeight = `${Math.max(0, window.innerHeight - top - 8)}px`;
    // The top layer prevents the pane's scroll containers from clipping the help.
    if (typeof element.showPopover === 'function') element.showPopover();
    else element.removeAttribute('popover');
    element.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) dismiss(); };
    const leave = () => dismiss();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('blur', leave);
    window.addEventListener('resize', leave);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('blur', leave);
      window.removeEventListener('resize', leave);
    };
  }, [open]);

  return <div ref={root} className="sf-tests-help" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); dismiss(true); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dismiss(); }}>
    <style>{`
.sf-tests-help { display:inline-flex; flex:none; }
.sf-tests-help-trigger,.sf-tests-help-close { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border:0; border-radius:5px; background:transparent; color:var(--sf-muted); cursor:pointer; }
.sf-tests-help-trigger:hover,.sf-tests-help-close:hover { background:var(--sf-soft); color:var(--sf-text); }
.sf-tests-help-trigger:focus-visible,.sf-tests-help-close:focus-visible { outline:2px solid var(--sf-accent); outline-offset:-2px; }
.sf-tests-help-popup { position:fixed; inset:auto; margin:0; padding:14px; box-sizing:border-box; overflow:auto; z-index:100; border:1px solid var(--sf-border); border-radius:9px; background:var(--sf-bg); color:var(--sf-text); box-shadow:0 8px 28px #0002; font-family:inherit; font-size:12px; line-height:1.6; }
.sf-tests-help-popup:focus { outline:none; }
.sf-tests-help-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.sf-tests-help-heading h3 { margin:0; font-size:13px; }
.sf-tests-help-popup p { margin:0 0 14px; color:var(--sf-muted); }
.sf-tests-help-popup p:last-child { margin-bottom:0; font-size:11px; }
.sf-tests-help-popup strong { display:block; color:var(--sf-text); }
    `}</style>
    <button ref={trigger} type="button" className="sf-tests-help-trigger" aria-label="How these tests work" title="How these tests work" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><CircleHelp size={16} aria-hidden="true" /></button>
    {open && <div ref={popup} id={id} className="sf-tests-help-popup" popover="manual" role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="sf-tests-help-heading"><h3 id={`${id}-title`}>How these tests work</h3><button type="button" className="sf-tests-help-close" aria-label="Close test help" onClick={() => dismiss(true)}><X size={15} aria-hidden="true" /></button></div>
      <p><strong>Simulate</strong>Replays every configured customer message against the editor source{dirty ? ', including unsaved changes' : ''}. A pass applies to this case’s expectations and recorded exchange. Actions are simulated.</p>
      <p><strong>Org eval</strong>Tests the agent published on the org. Multi-turn exports replay the final message with captured history; earlier replies remain fixed context.</p>
      <p>Only exported checks that pass org eval count as Release eval evidence.</p>
    </div>}
  </div>;
}

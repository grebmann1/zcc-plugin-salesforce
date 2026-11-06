/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StudioToolMenu } from './StudioToolPicker.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });
async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el), select = vi.fn();
  cleanup.push(() => { act(() => root.unmount()); el.remove(); });
  await act(async () => { root.render(<StudioToolMenu onSelect={select} />); });
  const trigger = within(el).getByRole('button', { name: 'Add Studio tool' });
  const open = () => act(() => { fireEvent.click(trigger); });
  return { el, select, trigger, open };
}
it('dismisses on iframe focus, resize and outside clicks without losing the trigger', async () => {
  const { el, open, trigger } = await mount();
  for (const event of ['blur', 'resize']) {
    open(); expect(within(el).getByRole('region')).toBeTruthy();
    act(() => { window.dispatchEvent(new Event(event)); });
    expect(within(el).queryByRole('region')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  }
  open();
  act(() => { fireEvent.pointerDown(within(el).getByRole('searchbox')); });
  expect(within(el).getByRole('region')).toBeTruthy();
  act(() => { fireEvent.pointerDown(document.body); });
  expect(within(el).queryByRole('region')).toBeNull();
  open();
  act(() => { fireEvent.focusOut(within(el).getByRole('searchbox'), { relatedTarget: null }); });
  expect(within(el).queryByRole('region')).toBeNull();
});
it('restores focus on Escape and dispatches a chosen tool once', async () => {
  const { el, open, trigger, select } = await mount();
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  expect(trigger.hasAttribute('aria-controls')).toBe(false);
  open();
  const dialog = within(el).getByRole('dialog', { name: 'Add Studio tool' });
  expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
  expect(document.activeElement).toBe(within(dialog).getByRole('searchbox'));
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => { within(dialog).getByRole('searchbox').dispatchEvent(escape); });
  expect(escape.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(trigger);
  expect(within(el).queryByRole('region')).toBeNull();
  expect(trigger.hasAttribute('aria-controls')).toBe(false);
  open();
  act(() => { fireEvent.click(within(el).getByRole('button', { name: /^Scorers / })); });
  expect(select.mock.calls).toEqual([['scorers']]);
  expect(document.activeElement).toBe(trigger);
  expect(within(el).queryByRole('region')).toBeNull();
});
it('dismisses from same-origin iframe pointer events and releases frame listeners', async () => {
  const { el, open } = await mount();
  const doc = document.implementation.createHTMLDocument(), frame = document.createElement('iframe');
  vi.spyOn(frame, 'contentDocument', 'get').mockReturnValue(doc);
  const query = document.querySelectorAll.bind(document);
  vi.spyOn(document, 'querySelectorAll').mockImplementation(((selector: string) => selector === 'iframe' ? [frame] : query(selector)) as typeof document.querySelectorAll);
  const remove = vi.spyOn(doc, 'removeEventListener');
  open();
  act(() => { doc.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  expect(within(el).queryByRole('region')).toBeNull();
  expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  open();
  const nextDoc = document.implementation.createHTMLDocument();
  vi.spyOn(frame, 'contentDocument', 'get').mockReturnValue(nextDoc);
  act(() => { frame.dispatchEvent(new Event('load')); nextDoc.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  expect(within(el).queryByRole('region')).toBeNull();
});

it('leaves shell work to the host terminal instead of advertising a second console', async () => {
  const { el, open, select } = await mount(); open();
  const catalog = within(el).getByRole('region');
  expect(within(catalog).queryByRole('button', { name: /^Terminal / })).toBeNull();
  act(() => { fireEvent.change(within(catalog).getByRole('searchbox'), { target: { value: 'terminal' } }); });
  expect(within(catalog).queryByRole('button', { name: /^Terminal / })).toBeNull();
  expect(select).not.toHaveBeenCalled();
});

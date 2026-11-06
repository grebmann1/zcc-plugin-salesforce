/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudioActionMenu } from './StudioActionMenu.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(disabled = false) {
  const run = vi.fn();
  const view = render(<><StudioActionMenu label="Test commands" actions={[
    { id: 'compare', label: 'Compare sources', group: 'Evaluate', onSelect: run },
    { id: 'org', label: 'Run org eval', group: 'Evaluate', disabled, title: 'Requires saved cases', onSelect: run },
    { id: 'export', label: 'Export cases', group: 'Manage', onSelect: run },
  ]} /><button>Outside</button></>);
  const trigger = screen.getByRole('button', { name: 'Test commands' });
  return { run, view, trigger };
}
it('opens a grouped command menu, invokes one command and returns focus', () => {
  const { trigger, run } = setup();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  const first = screen.getByRole('menuitem', { name: 'Compare sources' });
  expect(document.activeElement).toBe(first);
  expect(screen.getAllByRole('presentation').map(el => el.textContent)).toEqual(['Evaluate', 'Manage']);
  expect(screen.getByRole('menu', { name: 'Test commands' }).id).toBe(trigger.getAttribute('aria-controls'));
  fireEvent.click(first);
  expect(run).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.click(trigger);
  expect(screen.queryByRole('menu')).toBeNull();
});
it('supports keyboard navigation, skips unavailable commands and restores focus on Escape and Tab', () => {
  const { trigger, run } = setup(true);
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const first = screen.getByRole('menuitem', { name: 'Compare sources' });
  const last = screen.getByRole('menuitem', { name: 'Export cases' });
  const disabled = screen.getByRole('menuitem', { name: 'Run org eval' }) as HTMLButtonElement;
  expect(disabled.disabled).toBe(true);
  expect(disabled.title).toBe('Requires saved cases');
  fireEvent.click(disabled); expect(run).not.toHaveBeenCalled();
  fireEvent.keyDown(first, { key: 'ArrowDown' }); expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'ArrowDown' }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'ArrowUp' }); expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'Home' }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'End' }); expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'Escape' }); expect(document.activeElement).toBe(trigger);
  fireEvent.keyDown(trigger, { key: 'ArrowUp' }); expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Export cases' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('dismisses on outside pointer, focus leaving, window blur and resize', () => {
  const { trigger } = setup();
  fireEvent.keyDown(trigger, { key: 'a' }); expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger); fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Compare sources' }));
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' })); expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger); fireEvent.blur(screen.getByRole('menuitem', { name: 'Compare sources' }), { relatedTarget: screen.getByRole('button', { name: 'Outside' }) });
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger); fireEvent(window, new Event('blur')); expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger); fireEvent(window, new Event('resize')); expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger); fireEvent.scroll(screen.getByRole('menu')); expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.scroll(window); expect(screen.queryByRole('menu')).toBeNull();
});
it('uses the native top layer and flips above a low trigger without overflowing the viewport', () => {
  const show = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(300);
  const { trigger } = setup();
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 200, top: window.innerHeight - 50, bottom: window.innerHeight - 20 } as DOMRect);
  fireEvent.click(trigger);
  const menu = screen.getByRole('menu');
  expect(show).toHaveBeenCalledTimes(1);
  delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
  expect(parseFloat(menu.style.top)).toBeLessThan(window.innerHeight - 50);
  expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8);
});

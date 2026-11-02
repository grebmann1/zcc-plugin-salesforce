/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TestsHelp } from './TestsHelp.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const trigger = () => screen.getByRole('button', { name: 'How these tests work' });
const open = () => { fireEvent.click(trigger()); return screen.getByRole('dialog', { name: 'How these tests work' }); };

it('keeps guidance out of the layout until requested and shows editor-specific guidance', () => {
  const { rerender } = render(<TestsHelp />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  const popup = open();
  expect(popup.textContent).toContain('Actions are simulated.');
  expect(popup.textContent).toContain('earlier replies remain fixed context.');
  expect(popup.textContent).not.toContain('including unsaved changes');
  expect(document.activeElement).toBe(popup);
  expect(trigger().getAttribute('aria-controls')).toBe(popup.id);
  rerender(<TestsHelp dirty />);
  expect(popup.textContent).toContain('including unsaved changes');
});

it('closes with Escape or the close button and restores focus', () => {
  render(<TestsHelp />);
  const popup = open();
  fireEvent.keyDown(popup, { key: 'ArrowDown' });
  expect(screen.getByRole('dialog')).toBe(popup);
  fireEvent.keyDown(popup, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  open(); fireEvent.click(screen.getByRole('button', { name: 'Close test help' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it('dismisses on toggle, outside pointer and keyboard focus leaving the help', () => {
  render(<><TestsHelp /><button>Next control</button></>);
  const popup = open();
  fireEvent.pointerDown(popup);
  expect(screen.getByRole('dialog')).toBe(popup);
  fireEvent.click(trigger()); expect(screen.queryByRole('dialog')).toBeNull();
  open(); fireEvent.pointerDown(document.body); expect(screen.queryByRole('dialog')).toBeNull();
  const next = screen.getByRole('button', { name: 'Next control' });
  open(); act(() => next.focus()); expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(next);
});

it('dismisses for iframe blur and window resize, and cleans up listeners', () => {
  const { unmount } = render(<TestsHelp />);
  open(); fireEvent.blur(window); expect(screen.queryByRole('dialog')).toBeNull();
  open(); fireEvent.resize(window); expect(screen.queryByRole('dialog')).toBeNull();
  open(); unmount(); fireEvent.pointerDown(document.body); fireEvent.blur(window);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('bounds the overlay within a narrow viewport and falls back without native popovers', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 290, bottom: 48 } as DOMRect);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(240);
  render(<TestsHelp />);
  const popup = open();
  expect(popup.style.width).toBe('304px');
  expect(popup.style.left).toBe('8px');
  expect(popup.style.top).toBe('54px');
  expect(popup.style.maxHeight).toBe('178px');
});

it('uses the native top layer when available so scroll containers cannot clip help', () => {
  const show = vi.fn();
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
  try {
    render(<TestsHelp />); open();
    expect(show).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog').getAttribute('popover')).toBe('manual');
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, 'showPopover', original);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
  }
});

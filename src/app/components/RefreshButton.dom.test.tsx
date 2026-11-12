/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RefreshButton } from './RefreshButton.js';

afterEach(cleanup);

it('offers an icon-only refresh with a tooltip and accessible name without submitting its surrounding form', () => {
  const refresh = vi.fn(), submit = vi.fn();
  render(<form onSubmit={submit}><RefreshButton label="Refresh implementation" onClick={refresh} /></form>);
  const button = screen.getByRole('button', { name: 'Refresh implementation' });
  expect(button.getAttribute('title')).toBe('Refresh implementation');
  expect(button.textContent).toBe('');
  expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(refresh).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});

it('prevents duplicate refreshes while busy or unavailable and allows another refresh when ready', () => {
  const refresh = vi.fn();
  const view = render(<RefreshButton label="Refresh tests" busy onClick={refresh} />);
  const button = screen.getByRole('button', { name: 'Refresh tests' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(button);
  view.rerender(<RefreshButton label="Refresh tests" disabled onClick={refresh} />);
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('false');
  fireEvent.click(button);
  expect(refresh).not.toHaveBeenCalled();
  view.rerender(<RefreshButton label="Refresh tests" onClick={refresh} />);
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(refresh).toHaveBeenCalledOnce();
});

/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TestsHeader, type TestsView } from './TestsHeader.js';

afterEach(cleanup);

it('keeps the title, help and navigation mounted in every view, with exactly one selected destination', () => {
  const onViewChange = vi.fn();
  const props = { view: 'cases' as TestsView, onViewChange, dirty: false, suite: { path: 'tests/MyBot.scenario.json', cases: [{}, {}] } };
  const { rerender } = render(<TestsHeader {...props} />);
  const header = screen.getByTestId('tests-header');
  const help = screen.getByRole('button', { name: 'How these tests work' });
  const nav = screen.getByRole('group', { name: 'Tests view' });
  const buttons = [...within(nav).getAllByRole('button'), screen.getByRole('button', { name: 'Browse tests' })];
  expect(buttons.map(button => button.textContent)).toEqual(['Scenarios', 'Test cases', 'Batch simulations', 'Role-play', 'Browse tests']);
  for (const [index, view] of (['scenarios', 'cases', 'simulations', 'roleplay', 'org'] as const).entries()) {
    fireEvent.click(buttons[index]);
    expect(onViewChange).toHaveBeenLastCalledWith(view);
    rerender(<TestsHeader {...props} view={view} />);
    expect(screen.getByTestId('tests-header')).toBe(header);
    expect(screen.getByRole('button', { name: 'How these tests work' })).toBe(help);
    expect(screen.getByRole('group', { name: 'Tests view' })).toBe(nav);
    expect(buttons.filter(button => button.getAttribute('aria-pressed') === 'true')).toEqual([buttons[index]]);
    expect(screen.getByText('tests/MyBot.scenario.json · 2 cases').title).toBe('tests/MyBot.scenario.json · 2 cases');
  }
  fireEvent.click(help);
  expect(screen.getByRole('dialog').textContent).toContain('Actions are simulated.');
});

it('supports empty workspaces and embedded suites without a second navigation row', () => {
  const { rerender } = render(<TestsHeader view="cases" onViewChange={vi.fn()} dirty />);
  expect(screen.queryByText(/scenario.json/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'How these tests work' }));
  expect(screen.getByRole('dialog').textContent).toContain('including unsaved changes');
  rerender(<TestsHeader view="cases" onViewChange={vi.fn()} dirty={false} casesOnly suite={{ path: 'tests/One.scenario.json', cases: [{}] }} />);
  expect(screen.getByText('tests/One.scenario.json · 1 case')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Tests view' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Browse tests' })).toBeNull();
  expect(screen.getByRole('button', { name: 'How these tests work' })).toBeTruthy();
});

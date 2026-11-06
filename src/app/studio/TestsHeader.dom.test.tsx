/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TestsHeader, type TestsView } from './TestsHeader.js';

afterEach(cleanup);

it('keeps the title, help and navigation mounted in every view, with exactly one selected destination', () => {
  const onViewChange = vi.fn();
  const props = { view: 'cases' as TestsView, onViewChange, dirty: false, scenarioCount: 27, suite: { path: 'tests/MyBot.scenario.json', cases: [{}, {}] } };
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
    const label = view === 'cases' ? 'tests/MyBot.scenario.json · 2 saved test cases' : view === 'org' ? 'Local suites and org tests' : '27 shared scenarios · this agent';
    expect(screen.getByText(label).title).toBe(label);
    if (view !== 'cases') expect(screen.queryByText(/MyBot.scenario.json/)).toBeNull();
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
  expect(screen.getByText('tests/One.scenario.json · 1 saved test case')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Tests view' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Browse tests' })).toBeNull();
  expect(screen.getByRole('button', { name: 'How these tests work' })).toBeTruthy();
});

it('keeps embedded Evals suites free of duplicate workspace navigation', () => {
  render(<TestsHeader title="Evals" view="cases" onViewChange={vi.fn()} dirty={false} casesOnly />);
  expect(screen.getByRole('heading', { name: 'Evals' })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Tests view' })).toBeNull();
});

it('exposes every original testing destination under the Evals header without remounting navigation', () => {
  const onViewChange = vi.fn();
  const props = { title: 'Evals' as const, view: 'cases' as TestsView, onViewChange, dirty: true };
  const { rerender } = render(<TestsHeader {...props} />);
  const header = screen.getByTestId('tests-header');
  const nav = screen.getByRole('group', { name: 'Tests view' });
  expect(screen.getByTestId('tests-header').tagName).toBe('HEADER');
  expect(screen.queryByText('No evaluation suite selected')).toBeNull();
  for (const [name, view] of [['Scenarios', 'scenarios'], ['Test cases', 'cases'], ['Batch simulations', 'simulations'], ['Role-play', 'roleplay'], ['Browse tests', 'org']] as const) {
    fireEvent.click(screen.getByRole('button', { name, exact: true }));
    expect(onViewChange).toHaveBeenLastCalledWith(view);
    rerender(<TestsHeader {...props} view={view} suite={{ path: 'tests/Support.scenario.json', cases: [{}, {}] }} />);
    expect(screen.getByTestId('tests-header')).toBe(header);
    expect(screen.getByRole('group', { name: 'Tests view' })).toBe(nav);
    expect(within(header).getAllByRole('button').filter(button => button.getAttribute('aria-pressed') === 'true')).toEqual([screen.getByRole('button', { name, exact: true })]);
    expect(screen.getByRole('heading', { name: 'Evals' })).toBeTruthy();
    expect(header.textContent).toContain(view === 'cases' ? 'tests/Support.scenario.json · 2 saved test cases' : view === 'org' ? 'Local suites and org tests' : '0 shared scenarios · this agent');
  }
  fireEvent.click(screen.getByRole('button', { name: 'How these tests work' }));
  expect(screen.getByRole('dialog').textContent).toContain('including unsaved changes');
});

it('renames the original Tests interface without replacing its header, help, or navigation', () => {
  const props = { view: 'cases' as const, onViewChange: vi.fn(), dirty: false, suite: { path: 'tests/Support.scenario.json', cases: [{}, {}] } };
  const { rerender } = render(<TestsHeader {...props} title="Tests" />);
  const header = screen.getByTestId('tests-header');
  const help = screen.getByRole('button', { name: 'How these tests work' });
  const nav = screen.getByRole('group', { name: 'Tests view' });
  const original = header.outerHTML;
  rerender(<TestsHeader {...props} title="Evals" />);
  expect(screen.getByTestId('tests-header')).toBe(header);
  expect(screen.getByRole('button', { name: 'How these tests work' })).toBe(help);
  expect(screen.getByRole('group', { name: 'Tests view' })).toBe(nav);
  expect(header.outerHTML).toBe(original.replace('>Tests</h2>', '>Evals</h2>'));
});

/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ConversationScope } from './ConversationScope.js';

afterEach(cleanup);
const user = { role: 'user' as const }, agent = { role: 'agent' as const };
it('shows no coverage without recorded messages', () => {
  const { container } = render(<ConversationScope turns={[]} plannedTurns={2} />);
  expect(container.textContent).toBe('');
});
it('counts replies without counting the runtime greeting and explains one-exchange limits', () => {
  render(<ConversationScope turns={[agent, user, agent]} plannedTurns={1} />);
  expect(screen.getByText('1 of 1 customer turn · 1 agent reply')).toBeTruthy();
  expect(screen.getByText(/One exchange only/)).toBeTruthy();
});
it('describes complete multi-turn evidence without claiming real business effects', () => {
  render(<ConversationScope turns={[user, agent, user, agent]} plannedTurns={2} />);
  expect(screen.getByText('2 of 2 customer turns · 2 agent replies')).toBeTruthy();
  expect(screen.getByText(/Simulated actions do not prove live business effects/)).toBeTruthy();
});
it.each([{ turns: [user, agent] }, { turns: [user, agent, user] }])('identifies missing configured turns or replies', ({ turns }) => {
  render(<ConversationScope turns={turns} plannedTurns={2} />);
  expect(screen.getByText(/does not cover every configured customer turn and reply/)).toBeTruthy();
});
it('distinguishes storage truncation from a runtime that ended early', () => {
  render(<ConversationScope turns={[user, agent]} plannedTurns={2} truncated />);
  expect(screen.getByText(/saved recording was shortened/)).toBeTruthy();
  expect(screen.queryByText(/does not cover every configured/)).toBeNull();
});

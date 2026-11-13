/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommentsPane } from './CommentsPane.js';
import type { StudioComment } from '../../../lib/studio-contract.js';

afterEach(cleanup);
const c = (id: string, line: number, extra: Partial<StudioComment> = {}): StudioComment => ({ id, path: 'a.agent', line, endLine: line, quote: 'q1\nq2\nq3\nq4', body: `body ${id}`, author: { kind: 'user', name: 'You' }, createdAt: 1, ...extra });
const props = { pluginId: 'salesforce', projectId: 'p', path: 'a.agent' };

it('lists open comments in line order, jumps to a line and resolves with a required note', () => {
  const onReveal = vi.fn(); const onResolve = vi.fn(); const onAddress = vi.fn();
  render(<CommentsPane {...props} comments={[c('b', 9, { endLine: 11 }), c('a', 2), c('x', 1, { path: 'other.agent' })]} onReveal={onReveal} onResolve={onResolve} onAddressWithAgent={onAddress} />);
  const bodies = screen.getAllByText(/^body/).map(n => n.textContent);
  expect(bodies).toEqual(['body a', 'body b']);
  expect(screen.getByText('Open (2)')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Jump to line 9'));
  expect(onReveal).toHaveBeenCalledWith(9);
  expect(screen.getByText('L9-11')).toBeTruthy();
  fireEvent.click(screen.getByText('Address with agent')); expect(onAddress).toHaveBeenCalled();
  fireEvent.click(screen.getAllByText('Resolve')[0]!);
  const input = screen.getByLabelText('Resolution note');
  const submit = screen.getAllByText('Resolve').find(n => n.className.includes('is-primary')) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.keyDown(input, { key: 'Enter' }); expect(onResolve).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '  fixed  ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onResolve).toHaveBeenCalledWith('a', 'fixed');
  expect(screen.queryByLabelText('Resolution note')).toBeNull();
});

it('cancels a pending resolve, shows resolved comments and empty states', () => {
  render(<CommentsPane {...props} comments={[c('a', 2), c('r', 5, { resolved: { at: 1, note: 'did it', by: 'agent:t' } })]} />);
  fireEvent.click(screen.getByText('Resolve'));
  fireEvent.keyDown(screen.getByLabelText('Resolution note'), { key: 'Escape' });
  expect(screen.queryByLabelText('Resolution note')).toBeNull();
  fireEvent.click(screen.getByText('Resolve')); fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getByText('Address with agent').hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByText('Resolved (1)'));
  expect(screen.getByText(/Resolved by agent:t: did it/)).toBeTruthy();
  cleanup();
  render(<CommentsPane {...props} comments={[]} />);
  expect(screen.getByText(/No open comments/)).toBeTruthy();
  fireEvent.click(screen.getByText('Resolved (0)'));
  expect(screen.getByText('Nothing resolved yet.')).toBeTruthy();
});

it('shows every path when no file is open', () => {
  render(<CommentsPane pluginId="s" path={null} comments={[c('x', 1, { path: 'z.agent' })]} />);
  expect(screen.getByText('body x')).toBeTruthy();
});

it('edits own open comments and deletes after confirming', () => {
  const onEdit = vi.fn(); const onDelete = vi.fn();
  const agent = c('g', 4, { author: { kind: 'agent', threadId: 't', name: 'Agent' } });
  render(<CommentsPane {...props} comments={[c('a', 2, { editedAt: 3 }), agent, c('r', 6, { resolved: { at: 1, note: 'n', by: 'user' } })]} onEdit={onEdit} onDelete={onDelete} />);
  expect(screen.getByText('(edited)')).toBeTruthy();
  // Only the user's own comment offers Edit.
  expect(screen.getAllByText('Edit')).toHaveLength(1);
  fireEvent.click(screen.getByText('Edit'));
  const box = screen.getByLabelText('Edit comment') as HTMLTextAreaElement;
  expect(box.value).toBe('body a');
  // Unchanged text closes without a call; Escape cancels.
  fireEvent.click(screen.getByText('Save'));
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.keyDown(screen.getByLabelText('Edit comment'), { key: 'Escape' });
  expect(screen.queryByLabelText('Edit comment')).toBeNull();
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: '   ' } });
  expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByLabelText('Edit comment'), { key: 'Enter', metaKey: true });
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: ' reworded ' } });
  fireEvent.keyDown(screen.getByLabelText('Edit comment'), { key: 'Enter', ctrlKey: true });
  expect(onEdit).toHaveBeenCalledWith('a', 'reworded');
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.queryByLabelText('Edit comment')).toBeNull();
  fireEvent.click(screen.getAllByText('Delete')[1]!);
  expect(screen.getByText('Delete this comment?')).toBeTruthy();
  fireEvent.click(screen.getByText('Cancel'));
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByText('Delete')[1]!);
  fireEvent.click(screen.getAllByText('Delete').find(n => n.className.includes('is-danger'))!);
  expect(onDelete).toHaveBeenCalledWith('g');
  // Resolved comments can be deleted but not edited.
  fireEvent.click(screen.getByText('Resolved (1)'));
  expect(screen.queryByText('Edit')).toBeNull();
  expect(screen.getByText('Delete')).toBeTruthy();
});

it('hides Edit and Delete without handlers', () => {
  render(<CommentsPane {...props} comments={[c('a', 2)]} />);
  expect(screen.queryByText('Edit')).toBeNull();
  expect(screen.queryByText('Delete')).toBeNull();
});

it('shows pending handoff and acknowledged draft feedback without resolving comments or duplicating requests', async () => {
  let finish!: (value: { kind: 'draft' }) => void;
  const onAddress = vi.fn(() => new Promise<{ kind: 'draft' }>(resolve => { finish = resolve; }));
  const onResolve = vi.fn();
  render(<CommentsPane {...props} comments={[c('a', 2)]} onAddressWithAgent={onAddress} onResolve={onResolve} />);
  const button = screen.getByRole('button', { name: 'Address with agent' });
  fireEvent.click(button); fireEvent.click(button);
  expect(onAddress).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Preparing…' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Preparing');
  await act(async () => finish({ kind: 'draft' }));
  expect(screen.getByRole('status').textContent).toContain('Choose an agent and send it');
  expect(screen.getByRole('button', { name: 'Address with agent' }).hasAttribute('disabled')).toBe(false);
  expect(onResolve).not.toHaveBeenCalled();
  expect(screen.getByText('Open (1)')).toBeTruthy();
});

it('shows a local failure and allows retry, then confirms the existing conversation opened', async () => {
  const onAddress = vi.fn().mockRejectedValueOnce(new Error('Host refused the handoff')).mockRejectedValueOnce('offline').mockResolvedValue({ kind: 'thread', threadId: 't' });
  render(<CommentsPane {...props} comments={[c('a', 2)]} onAddressWithAgent={onAddress} />);
  fireEvent.click(screen.getByText('Address with agent'));
  expect((await screen.findByRole('alert')).textContent).toBe('Host refused the handoff');
  fireEvent.click(screen.getByText('Address with agent'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('offline'));
  fireEvent.click(screen.getByText('Address with agent'));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Agent conversation opened.'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('ignores an old file handoff completion and a late failure after unmount', async () => {
  let finish!: (value: { kind: 'draft' }) => void;
  let fail!: (error: Error) => void;
  const onAddress = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const { rerender, unmount } = render(<CommentsPane {...props} comments={[c('a', 2), c('b', 3, { path: 'b.agent' })]} onAddressWithAgent={onAddress} />);
  fireEvent.click(screen.getByText('Address with agent'));
  rerender(<CommentsPane {...props} path="b.agent" comments={[c('b', 3, { path: 'b.agent' })]} onAddressWithAgent={onAddress} />);
  await act(async () => finish({ kind: 'draft' }));
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByText('Address with agent'));
  unmount();
  await act(async () => fail(new Error('late')));
  expect(onAddress).toHaveBeenCalledTimes(2);
});

/** @vitest-environment happy-dom */
import { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { REFERENCE_POLL_MS, referenceFileChange, referenceVisible, useReferenceRefresh, type ReferenceRead } from './useReferenceRefresh.js';

const events = vi.hoisted(() => ({ handler: (_payload: unknown) => {} }));
vi.mock('@zana-ai/zcc-plugin-sdk/app', () => ({ useRealtime: (_channel: string, handler: (payload: unknown) => void) => { events.handler = handler; } }));
type Snapshot = { path: string; content: string };
const saved: Snapshot = { path: 'lwc/card', content: 'saved' };
const read = vi.fn<(request: ReferenceRead<Snapshot>) => Promise<Snapshot>>();
const remember = vi.fn();
let observed: ReturnType<typeof useReferenceRefresh<Snapshot>>;
function Probe({ scope = 'p:card', projectId = 'p', enabled = true, automatic = true, hidden = false, initial }: { scope?: string; projectId?: string; enabled?: boolean; automatic?: boolean; hidden?: boolean; initial?: Snapshot }) {
  const element = useRef<HTMLElement>(null);
  observed = useReferenceRefresh({ scope, projectId, enabled, automatic, element, initial, read, remember, paths: data => data ? [data.path] : [] });
  return <div hidden={hidden}><section ref={element}>{observed.data?.content}</section></div>;
}
const flush = () => act(async () => {});
beforeEach(() => { vi.useFakeTimers(); read.mockReset().mockResolvedValue(saved); remember.mockClear(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('matches exact project identities and exact files or bundle children, never sibling paths', () => {
  const event = { kind: 'files', projectId: 'p', path: 'lwc/card/card.js' };
  expect(referenceFileChange(event, 'p', ['lwc/card'])).toBe(true);
  expect(referenceFileChange({ ...event, path: 'lwc/card' }, 'p', ['lwc/card'])).toBe(true);
  expect(referenceFileChange({ ...event, path: 'lwc/cardinal/card.js' }, 'p', ['lwc/card'])).toBe(false);
  expect(referenceFileChange(event, 'other', ['lwc/card'])).toBe(false);
  expect(referenceFileChange({ ...event, projectId: undefined }, 'p')).toBe(false);
  expect(referenceFileChange({ ...event, kind: 'comments' }, 'p')).toBe(false);
  expect(referenceFileChange(null, 'p')).toBe(false);
  expect(referenceFileChange([], 'p')).toBe(false);
  expect(referenceFileChange('files', 'p')).toBe(false);
  for (const path of [null, 42, {}, '', false]) expect(referenceFileChange({ kind: 'files', projectId: 'p', path }, 'p', ['lwc/card'])).toBe(false);
  expect(referenceFileChange({ kind: 'files', projectId: 'p' }, 'p', ['lwc/card'])).toBe(true);
  expect(referenceFileChange(event, 'p')).toBe(true);
});
it('recognizes hidden windows and mounted hidden tools without relying on layout dimensions', () => {
  const ui = render(<div><section /></div>);
  const element = ui.container.querySelector('section')!;
  expect(referenceVisible(null)).toBe(false);
  expect(referenceVisible(document.createElement('section'))).toBe(false);
  expect(referenceVisible(element)).toBe(true);
  const parent = element.parentElement!;
  for (const attribute of ['hidden', 'aria-hidden']) {
    parent.setAttribute(attribute, 'true'); expect(referenceVisible(element)).toBe(false); parent.removeAttribute(attribute);
  }
  parent.style.display = 'none'; expect(referenceVisible(element)).toBe(false); parent.style.display = '';
  parent.style.visibility = 'hidden'; expect(referenceVisible(element)).toBe(false); parent.style.visibility = '';
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  expect(referenceVisible(element)).toBe(false);
});
it('polls only a visible local viewer, recovers on focus, and retains unchanged snapshot identity/revision', async () => {
  const ui = render(<Probe />); await flush();
  const first = observed.data; const revision = observed.revision;
  read.mockResolvedValue({ ...saved });
  await act(async () => { vi.advanceTimersByTime(REFERENCE_POLL_MS); });
  expect(read).toHaveBeenCalledTimes(2); expect(observed.data).toBe(first); expect(observed.revision).toBe(revision);
  ui.rerender(<Probe hidden />);
  await act(async () => { vi.advanceTimersByTime(REFERENCE_POLL_MS * 3); window.dispatchEvent(new Event('focus')); events.handler({ kind: 'files', projectId: 'p' }); });
  expect(read).toHaveBeenCalledTimes(2);
  ui.rerender(<Probe />);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(read).toHaveBeenCalledTimes(3);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => { vi.advanceTimersByTime(REFERENCE_POLL_MS); document.dispatchEvent(new Event('visibilitychange')); });
  expect(read).toHaveBeenCalledTimes(3);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(read).toHaveBeenCalledTimes(4);
});
it('coalesces mutation events during one read without overlapping or building a poll backlog', async () => {
  let finish!: (value: Snapshot) => void;
  read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<Probe />);
  await act(async () => { vi.advanceTimersByTime(REFERENCE_POLL_MS * 3); events.handler({ kind: 'files', projectId: 'p' }); events.handler({ kind: 'files', projectId: 'p' }); observed.refresh(); });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => finish(saved));
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => { events.handler({ kind: 'files', projectId: 'other' }); events.handler({ kind: 'files', projectId: 'p', path: 'lwc/unrelated/card.js' }); });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => events.handler({ kind: 'files', projectId: 'p', path: 'lwc/card/card.js' }));
  expect(read).toHaveBeenCalledTimes(3);
});
it('keeps the last snapshot and reports read failures, then lets manual refresh recover', async () => {
  render(<Probe initial={saved} />); await flush();
  read.mockRejectedValueOnce(Error('Offline'));
  await act(async () => observed.refresh());
  expect(observed).toMatchObject({ data: saved, error: 'Offline', busy: false });
  read.mockRejectedValueOnce('Disconnected');
  await act(async () => observed.refresh()); expect(observed.error).toBe('Disconnected');
  read.mockResolvedValueOnce({ ...saved, content: 'new' });
  await act(async () => observed.refresh());
  expect(observed.data?.content).toBe('new'); expect(observed.error).toBeUndefined(); expect(observed.revision).toBe(1);
});
it('cancels stale project answers, follow-up reads and unmounted updates', async () => {
  let finish!: (value: Snapshot) => void;
  read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const ui = render(<Probe />);
  const oldRequest = read.mock.calls[0][0];
  ui.rerender(<Probe scope="other:card" projectId="other" />); await flush();
  expect(oldRequest.isCurrent()).toBe(false);
  const latest = observed.data;
  await act(async () => finish({ ...saved, content: 'stale' }));
  expect(observed.data).toBe(latest); expect(remember).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'stale' }));
  ui.unmount();
  const count = read.mock.calls.length;
  await act(async () => { vi.advanceTimersByTime(REFERENCE_POLL_MS); window.dispatchEvent(new Event('focus')); observed.refresh(); });
  expect(read).toHaveBeenCalledTimes(count);
});
it('does not read disabled viewers, and leaves org-like viewers on explicit refresh only', async () => {
  const ui = render(<Probe enabled={false} />); await flush();
  await act(async () => observed.refresh()); expect(read).not.toHaveBeenCalled();
  ui.rerender(<Probe automatic={false} />); await flush(); expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(REFERENCE_POLL_MS * 2); window.dispatchEvent(new Event('focus')); events.handler({ kind: 'files', projectId: 'p' }); });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => observed.refresh()); expect(read).toHaveBeenCalledTimes(2);
});

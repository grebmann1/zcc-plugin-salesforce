import { describe, expect, it, vi } from 'vitest';
import { queueAgentScriptOpen, subscribeAgentScriptOpen, takeQueuedAgentScriptOpen } from './agent-script-open.js';

describe('queued Agent Script open', () => {
  it('stores one path per project and consumes it once', () => {
    queueAgentScriptOpen('p1', 'force-app/Bot.agent');
    queueAgentScriptOpen('p1', 'force-app/Other.agent');
    expect(takeQueuedAgentScriptOpen('p1')).toBe('force-app/Other.agent');
    expect(takeQueuedAgentScriptOpen('p1')).toBeNull();
  });
  it('notifies mounted tabs by project and withdraws their listener on cleanup', () => {
    const notified = vi.fn();
    const unsubscribe = subscribeAgentScriptOpen(notified);
    queueAgentScriptOpen(' p1 ', ' force-app/Bot.agent ');
    queueAgentScriptOpen('p2', 'force-app/Other.agent');
    expect(notified.mock.calls).toEqual([['p1'], ['p2']]);
    expect(takeQueuedAgentScriptOpen('p1')).toBe('force-app/Bot.agent');
    expect(takeQueuedAgentScriptOpen('p2')).toBe('force-app/Other.agent');
    unsubscribe();
    queueAgentScriptOpen('p1', 'force-app/After.agent');
    expect(notified).toHaveBeenCalledTimes(2);
    expect(takeQueuedAgentScriptOpen('p1')).toBe('force-app/After.agent');
  });
  it('ignores empty projects and paths without announcing an open', () => {
    const notified = vi.fn();
    const unsubscribe = subscribeAgentScriptOpen(notified);
    queueAgentScriptOpen(' ', 'force-app/Bot.agent');
    queueAgentScriptOpen('p1', ' ');
    expect(notified).not.toHaveBeenCalled();
    expect(takeQueuedAgentScriptOpen(' ')).toBeNull();
    expect(takeQueuedAgentScriptOpen('p1')).toBeNull();
    unsubscribe();
  });
});

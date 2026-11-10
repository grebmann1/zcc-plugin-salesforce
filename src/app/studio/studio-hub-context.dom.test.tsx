/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { registerHubStudioProject, useHubStudioProject } from './studio-hub-context.js';

afterEach(cleanup);

describe('hub Studio project binding', () => {
  it('publishes the chosen project and releases it on unmount', () => {
    const { result, unmount } = renderHook(useHubStudioProject);
    expect(result.current).toBeUndefined();
    let release!: () => void;
    act(() => { release = registerHubStudioProject('chosen'); });
    expect(result.current).toBe('chosen');
    act(release);
    expect(result.current).toBeUndefined();
    unmount();
    // A binding may end after its final subscriber has gone away.
    release = registerHubStudioProject('last');
    release();
  });

  it('does not let stale effect cleanup clear a newer project or registration', () => {
    const { result } = renderHook(useHubStudioProject);
    let old!: () => void, next!: () => void, same!: () => void;
    act(() => { old = registerHubStudioProject('a'); next = registerHubStudioProject('b'); });
    act(old);
    expect(result.current).toBe('b');
    act(() => { same = registerHubStudioProject('b'); next(); });
    expect(result.current).toBe('b');
    act(same);
    expect(result.current).toBeUndefined();
  });
});

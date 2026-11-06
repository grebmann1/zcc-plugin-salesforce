/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useToolWorkspaceState } from './tool-workspace-state.js';
afterEach(cleanup);
it('retains drafts across host tab unmounts and keeps owners and fields separate', () => {
 const a = renderHook(() => useToolWorkspaceState('thread-a:tab-a:agent-a', 'draft', () => 'initial'));
 act(() => { a.result.current[1]('draft'); a.result.current[1](v => v + '!'); }); a.unmount();
 expect(renderHook(() => useToolWorkspaceState('thread-a:tab-a:agent-a', 'draft', '')).result.current[0]).toBe('draft!');
 expect(renderHook(() => useToolWorkspaceState('thread-b:tab-a:agent-a', 'draft', '')).result.current[0]).toBe('');
 expect(renderHook(() => useToolWorkspaceState('thread-a:tab-a:agent-a', 'query', '')).result.current[0]).toBe('');
});
it('changes owners without writing one draft over another, and opts out for existing Studio state', () => {
 const a = renderHook(({ key }) => useToolWorkspaceState(key, 'value', 'initial'), { initialProps: { key: 'first' as string | undefined } });
 act(() => a.result.current[1]('first draft')); a.rerender({ key: 'second' });
 expect(a.result.current[0]).toBe('initial');
 act(() => a.result.current[1](v => v + '!')); a.rerender({ key: 'first' });
 expect(a.result.current[0]).toBe('first draft');
 a.rerender({ key: undefined }); act(() => a.result.current[1]('temporary')); a.unmount();
 expect(renderHook(() => useToolWorkspaceState(undefined, 'value', 'initial')).result.current[0]).toBe('initial');
});
it('bounds retained workspaces', () => {
 for (let index = 0; index < 65; index++) {
   const a = renderHook(() => useToolWorkspaceState(`bounded-${index}`, 'value', 'initial'));
   act(() => a.result.current[1]('draft')); a.unmount();
 }
 expect(renderHook(() => useToolWorkspaceState('bounded-0', 'value', 'initial')).result.current[0]).toBe('initial');
 expect(renderHook(() => useToolWorkspaceState('bounded-64', 'value', 'initial')).result.current[0]).toBe('draft');
});

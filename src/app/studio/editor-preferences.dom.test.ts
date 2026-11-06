/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorPreferences } from './editor-preferences.js';
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('shares settings between Studio and thread tools without crossing projects', () => {
  const a = renderHook(() => useEditorPreferences('a'));
  const b = renderHook(() => useEditorPreferences('a'));
  const other = renderHook(() => useEditorPreferences('b'));
  act(() => { a.result.current[1](v => ({ ...v, wrap: true })); a.result.current[1](v => ({ ...v, lines: false })); });
  expect(b.result.current[0]).toEqual({ lines: false, wrap: true });
  expect(other.result.current[0]).toEqual({ lines: true, wrap: false });
  b.unmount();
  expect(renderHook(() => useEditorPreferences('a')).result.current[0]).toEqual({ lines: false, wrap: true });
});
it('loads a new project without overwriting its preferences and follows other windows', () => {
  localStorage.setItem('salesforce:editor-preferences:b', JSON.stringify({ lines: false, wrap: true }));
  const a = renderHook(({ scope }) => useEditorPreferences(scope), { initialProps: { scope: 'a' } });
  a.rerender({ scope: 'b' });
  expect(a.result.current[0]).toEqual({ lines: false, wrap: true });
  act(() => {
    localStorage.setItem('salesforce:editor-preferences:b', JSON.stringify({ lines: false, wrap: false }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
  });
  expect(a.result.current[0].wrap).toBe(true);
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'salesforce:editor-preferences:b', storageArea: sessionStorage })));
  expect(a.result.current[0].wrap).toBe(true);
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'salesforce:editor-preferences:b', storageArea: localStorage })));
  expect(a.result.current[0].wrap).toBe(false);
  act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })); });
  expect(a.result.current[0]).toEqual({ lines: true, wrap: false });
});
it('keeps mounted panels in sync when optional storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('unavailable'); });
  const a = renderHook(() => useEditorPreferences('private'));
  const b = renderHook(() => useEditorPreferences('private'));
  act(() => a.result.current[1]({ lines: false, wrap: true }));
  expect(b.result.current[0]).toEqual({ lines: false, wrap: true });
});

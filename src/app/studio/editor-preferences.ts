import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { EditorPreferences } from './BuilderTools.js';
const CHANGE = 'salesforce:editor-preferences-changed';
export function readEditorPreferences(key: string): EditorPreferences {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); return { lines: value?.lines !== false, wrap: value?.wrap === true }; }
  catch { return { lines: true, wrap: false }; }
}
export function useEditorPreferences(scope: string) {
  const key = `salesforce:editor-preferences:${scope}`;
  const [state, setState] = useState(() => ({ key, value: readEditorPreferences(key) }));
  const value = state.key === key ? state.value : readEditorPreferences(key);
  const latest = useRef({ key, value });
  latest.current = { key, value };
  useEffect(() => {
    setState(current => current.key === key ? current : { key, value: readEditorPreferences(key) });
    const changed = (event: Event) => {
      if (event instanceof StorageEvent) {
        if (event.storageArea && event.storageArea !== localStorage) return;
        if (event.key !== null && event.key !== key) return;
        latest.current = { key, value: readEditorPreferences(key) };
        setState(latest.current);
      } else {
        const detail = (event as CustomEvent<{ key: string; value: EditorPreferences }>).detail;
        if (detail?.key === key) { latest.current = { key, value: detail.value }; setState(latest.current); }
      }
    };
    window.addEventListener(CHANGE, changed);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener(CHANGE, changed); window.removeEventListener('storage', changed); };
  }, [key]);
  const setValue = useCallback((next: SetStateAction<EditorPreferences>) => {
    const current = latest.current.key === key ? latest.current.value : readEditorPreferences(key);
    const updated = typeof next === 'function' ? next(current) : next;
    latest.current = { key, value: updated };
    setState({ key, value: updated });
    try { localStorage.setItem(key, JSON.stringify(updated)); } catch { /* Keep mounted panels in sync even when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(CHANGE, { detail: { key, value: updated } }));
  }, [key]);
  return [value, setValue] as const;
}

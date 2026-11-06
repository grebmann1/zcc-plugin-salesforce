import { useEffect, useState, type SetStateAction } from 'react';

// The host unmounts inactive thread tabs. Keep only UI drafts in this window;
// recordings and running jobs continue to use their existing durable stores.
const workspaces = new Map<string, Map<string, unknown>>();
const LIMIT = 64;
function remember(key: string, slot: string, value: unknown) {
  const workspace = workspaces.get(key) ?? new Map<string, unknown>();
  workspaces.delete(key);
  workspace.set(slot, value);
  workspaces.set(key, workspace);
  while (workspaces.size > LIMIT) workspaces.delete(workspaces.keys().next().value!);
}
export function useToolWorkspaceState<T>(key: string | undefined, slot: string, initial: T | (() => T)) {
  const identity = JSON.stringify([key, slot]);
  const read = (): T => key && workspaces.get(key)?.has(slot) ? workspaces.get(key)!.get(slot) as T : typeof initial === 'function' ? (initial as () => T)() : initial;
  const [state, setState] = useState(() => ({ identity, value: read() }));
  const value = state.identity === identity ? state.value : read();
  useEffect(() => {
    if (state.identity !== identity) setState({ identity, value });
    if (key) remember(key, slot, value);
  }, [identity, key, slot, value, state.identity]);
  const setValue = (next: SetStateAction<T>) => setState(current => {
    const previous = current.identity === identity ? current.value : read();
    return { identity, value: typeof next === 'function' ? (next as (value: T) => T)(previous) : next };
  });
  return [value, setValue] as const;
}

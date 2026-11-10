import { useSyncExternalStore } from 'react';

// The global Salesforce nav panel owns its project picker. The host cannot pass
// that choice to its side-panel tools, so only the mounted hub Studio binds it.
let current: { projectId: string; token: symbol } | undefined;
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => current?.projectId;

export function registerHubStudioProject(projectId: string): () => void {
  const token = Symbol();
  current = { projectId, token };
  publish();
  return () => {
    if (current?.token !== token) return;
    current = undefined;
    publish();
  };
}

export function useHubStudioProject(): string | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

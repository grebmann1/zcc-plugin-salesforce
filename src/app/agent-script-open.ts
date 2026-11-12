const pendingByProject = new Map<string, string>();
const listeners = new Set<(projectId: string) => void>();

export function queueAgentScriptOpen(projectId: string, path: string): void {
  const id = projectId.trim();
  const next = path.trim();
  if (!id || !next) return;
  pendingByProject.set(id, next);
  for (const listener of listeners) listener(id);
}

/** Also notify an already-mounted Salesforce tab; navigation may not remount it. */
export function subscribeAgentScriptOpen(listener: (projectId: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function takeQueuedAgentScriptOpen(projectId: string): string | null {
  const id = projectId.trim();
  if (!id) return null;
  const path = pendingByProject.get(id) ?? null;
  if (path) pendingByProject.delete(id);
  return path;
}

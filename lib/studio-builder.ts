import { BUILDER_RPC, emptyBuilderResources, parseBuilderResources, type BuilderResources } from './studio-builder-contract.js';
import { STUDIO_CHANGED_CHANNEL } from './studio-contract.js';
import { rpcFailure, type StudioServerContext } from './studio-server-context.js';

export const builderResourcesKey = (project: string) => `studio:builder:v1:${project}`;
/** Use the same validated project document for the editor and scenario run snapshots. */
export async function readBuilderResources(kv: { get<T>(key: string): Promise<T | undefined | null> }, project: string): Promise<BuilderResources> {
  const saved = await kv.get<BuilderResources>(builderResourcesKey(project));
  return saved ? parseBuilderResources(saved, { migrateRetiredTools: true }) : emptyBuilderResources();
}

/** Project-scoped, optimistic writes. A stale window cannot overwrite another window's resources. */
export function registerStudioBuilder(studio: StudioServerContext) {
  const tails = new Map<string, Promise<unknown>>();
  const read = (project: string) => readBuilderResources(studio.zcc.storage.kv, project);
  studio.registerRpc(BUILDER_RPC.get, async () => {
    const project = studio.contexts.current()?.projectId;
    return project ? { ok: true, resources: await read(project) } : rpcFailure('project_required', 'Choose a project to use workspace resources.');
  });
  studio.registerRpc(BUILDER_RPC.save, async args => {
    const project = studio.contexts.current()?.projectId;
    if (!project) return rpcFailure('project_required', 'Choose a project to save workspace resources.');
    let next: BuilderResources;
    try { next = parseBuilderResources((args as { resources?: unknown } | null)?.resources); }
    catch (error) { return rpcFailure('invalid', (error as Error).message); }
    const work = async () => {
      const current = await read(project);
      if (current.revision !== next.revision) return rpcFailure('conflict', 'Workspace resources changed in another window. Reload before saving.');
      const resources = { ...next, revision: current.revision + 1 };
      await studio.zcc.storage.kv.set(builderResourcesKey(project), resources);
      try { studio.zcc.realtime.publish(STUDIO_CHANGED_CHANNEL, { projectId: project, kind: 'builder' }); } catch { /* The committed save remains successful if a subscriber disconnects. */ }
      return { ok: true, resources };
    };
    const pending = (tails.get(project) ?? Promise.resolve()).then(work);
    const tail = pending.catch(() => undefined);
    tails.set(project, tail);
    void tail.then(() => { if (tails.get(project) === tail) tails.delete(project); });
    return pending;
  });
}

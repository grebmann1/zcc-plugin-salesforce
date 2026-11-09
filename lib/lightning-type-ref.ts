/** Isomorphic Lightning Type reference validation, shared by the AST and local readers. */
const NAME = '[A-Za-z][A-Za-z0-9_]{0,79}';
const TYPE_REF = new RegExp(`^(?:(${NAME})__)?(${NAME})$`);

export interface LightningTypeRef { ref: string; standard: boolean; namespace?: string; bundle: string }

/** `lightning__textType` is standard, `c__Order` a local bundle, `ns__Order` a namespaced one. Apex class types are not Lightning Types. */
export function parseLightningTypeRef(ref: string): LightningTypeRef | null {
  const match = TYPE_REF.exec(ref.trim());
  if (!match || match[2].includes('__') || match[1]?.includes('__')) return null;
  const [, namespace, bundle] = match;
  if (namespace === 'lightning') return { ref, standard: true, namespace, bundle };
  if (!namespace) return { ref, standard: false, bundle };
  return { ref, standard: false, ...(namespace === 'c' ? {} : { namespace }), bundle };
}


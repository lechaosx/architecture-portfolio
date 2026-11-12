import type { CollectionEntry } from 'astro:content';

export const credentialedName = ({ credential, name }: Pick<CollectionEntry<'site'>['data'], 'credential' | 'name'>) =>
  [credential, name].filter(Boolean).join(' ');

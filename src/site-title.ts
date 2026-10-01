import { site } from './singletons';

export const credentialedName = [site.credential, site.name]
  .filter(Boolean)
  .join(' ');

import { frontmatter as site } from './content/singletons/site.md';

export const credentialedName = [site.credential, site.name]
  .filter(Boolean)
  .join(' ');

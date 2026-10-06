import { getCollection } from 'astro:content';
import { ui } from './i18n';
import { newestFirst, projectCover } from './projects';
import { getResponsiveImage } from './server-images';
import { credentialedName } from './site-title';

// The work page's content and head, which the forwarding page at / shares.

export const projects = await getCollection('projects', ({ data }) => !data.draft);

export const title = {
  cs: `${credentialedName} | ${ui.cs.tagline}`,
  en: `${credentialedName} | ${ui.en.tagline}`,
};

// The work grid's first cover; projects without images are not in the grid.
const cover = [...projects]
  .sort(newestFirst)
  .map(({ data }) => projectCover(data))
  .find((image) => image !== undefined);

export const image = cover && (await getResponsiveImage(cover.image))?.share;

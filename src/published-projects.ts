import { getCollection } from 'astro:content';
import { periodIssues } from './period';
import { withoutMissingImages } from './projects';
import { fileFound } from './server-images';

/**
 * The projects the site shows: no drafts, and no images whose file is missing.
 * The CMS cannot compare a period's ends or keep an image's file, so a wrong
 * period is shown as typed, a missing image left out, and both reported here.
 */
export const projects = (await getCollection('projects', ({ data }) => !data.draft)).map((project) => {
  for (const { field, message } of periodIssues(project.data)) {
    console.warn(`${project.filePath}: ${field}: ${message}`);
  }
  const data = withoutMissingImages(project.data, (path, field) => fileFound(path, `${project.filePath}: ${field}`));
  return { ...project, data };
});

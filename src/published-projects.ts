import { getCollection } from 'astro:content';
import { periodIssues } from './period';
import { withoutMissingImages } from './projects';
import { fileExists } from './server-images';

/**
 * The projects the site shows: no drafts, and no images whose file is missing.
 * The CMS cannot compare a period's ends or keep an image's file, so a wrong
 * period is shown as typed, a missing image left out, and both reported here.
 */
export const projects = (await getCollection('projects', ({ data }) => !data.draft)).map((project) => {
  const { data, issues } = withoutMissingImages(project.data, fileExists);
  for (const { field, message } of [...periodIssues(project.data), ...issues]) {
    console.warn(`${project.filePath}: ${field}: ${message}`);
  }
  return { ...project, data };
});

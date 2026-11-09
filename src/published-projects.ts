import { getCollection } from 'astro:content';
import { periodIssues } from './period';
import { withoutMissingImages } from './projects';
import { fileExists } from './server-images';

/**
 * The projects the site shows: no drafts, and no images whose file is missing.
 * The CMS cannot compare a period's ends, so a wrong period is shown as typed
 * and only reported here.
 */
export const projects = (await getCollection('projects', ({ data }) => !data.draft)).map((project) => {
  for (const { field, message } of periodIssues(project.data)) {
    console.warn(`${project.filePath}: ${field}: ${message}`);
  }
  return { ...project, data: withoutMissingImages(project.data, fileExists) };
});

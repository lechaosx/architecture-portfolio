import { getCollection } from 'astro:content';
import { periodIssues } from './period';
import { publishedProjects } from './projects';
import { fileFound } from './server-images';

/**
 * The projects the site shows. The CMS cannot compare a period's ends or keep
 * an image's file, so a wrong period is shown as typed, a missing image left
 * out, and both reported.
 */
export const projects = publishedProjects(await getCollection('projects'), fileFound);
for (const project of projects) {
  for (const { field, message } of periodIssues(project.data)) {
    console.warn(`${project.filePath}: ${field}: ${message}`);
  }
}

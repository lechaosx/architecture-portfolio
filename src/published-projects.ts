import { getCollection } from 'astro:content';
import { periodIssues } from './period';
import { publishedProjects, untitledImages } from './projects';
import { fileFound } from './server-images';

const entries = await getCollection('projects');

/**
 * The projects the site shows. The CMS cannot compare a period's ends or keep
 * an image's file, so a wrong period is shown as typed, a missing image left
 * out, and both reported, as is an untitled image an older save left.
 */
export const projects = publishedProjects(entries, fileFound);
// Checked before missing images are left out, so each field names its place in the file.
for (const { filePath, data } of entries.filter(({ data }) => !data.draft)) {
  for (const { field, message } of [...periodIssues(data), ...untitledImages(data)]) {
    console.warn(`${filePath}: ${field}: ${message}`);
  }
}

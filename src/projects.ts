import type { CollectionEntry } from 'astro:content';
import type { GalleryImage } from './components/gallery';

export type Project = Pick<CollectionEntry<'projects'>, 'id' | 'data'>;

/** A project in the grid, with its cover: its first image in page order. */
export type CardProject = Project & { cover: GalleryImage };

/** Newest year first, then by English title, so both languages list projects alike. */
export const newestFirst = (a: Project, b: Project) =>
  b.data.year - a.data.year || a.data.title_en.localeCompare(b.data.title_en);

/**
 * Newest first, split into the project grid's cards, the projects with a cover,
 * and the list of those without.
 */
export function workProjects(projects: Project[]): {
  grid: CardProject[];
  listed: Project[];
} {
  const grid: CardProject[] = [];
  const listed: Project[] = [];
  for (const project of [...projects].sort(newestFirst)) {
    const cover = project.data.blocks.find((block) => block.type !== 'text')?.images[0];
    if (cover) grid.push({ ...project, cover });
    else listed.push(project);
  }
  return { grid, listed };
}

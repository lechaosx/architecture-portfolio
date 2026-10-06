import type { CollectionEntry } from 'astro:content';

type Data = CollectionEntry<'projects'>['data'];

/** Newest year first, then by English title, so both languages list projects alike. */
export const newestFirst = (
  a: { data: Pick<Data, 'year' | 'title_en'> },
  b: { data: Pick<Data, 'year' | 'title_en'> },
) => b.data.year - a.data.year || a.data.title_en.localeCompare(b.data.title_en);

/** A project's cover: its first image in page order, if it has any. */
export const projectCover = ({ blocks }: Pick<Data, 'blocks'>) =>
  blocks.find((block) => block.type !== 'text')?.images[0];

type Cover = NonNullable<ReturnType<typeof projectCover>>;

/**
 * Newest first, split into the project grid's cards, the projects with a cover,
 * and the list of those without.
 */
export function workProjects<P extends { data: Data }>(projects: P[]) {
  const grid: (P & { cover: Cover })[] = [];
  const listed: P[] = [];
  for (const project of [...projects].sort(newestFirst)) {
    const cover = projectCover(project.data);
    if (cover) grid.push({ ...project, cover });
    else listed.push(project);
  }
  return { grid, listed };
}

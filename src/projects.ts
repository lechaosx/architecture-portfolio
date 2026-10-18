import type { CollectionEntry } from 'astro:content';
import type { GalleryImage } from './components/gallery';
import { latestFirst } from './period';

export type Project = Pick<CollectionEntry<'projects'>, 'id' | 'data'>;

export type CardProject = Project & { cover: GalleryImage };

export function projectCover(
  thumbnail: string | undefined,
  images: GalleryImage[],
): GalleryImage | undefined {
  const selected = thumbnail?.trim();
  return selected
    ? images.find(({ image }) => image === selected) ?? { image: selected }
    : images[0];
}

/** Latest period first, then by English title, so both languages list projects alike. */
export const newestFirst = (a: Project, b: Project) =>
  latestFirst(a.data, b.data) || a.data.title_en.localeCompare(b.data.title_en);

/** Cards need content blocks because projects without blocks have no page. */
export function workProjects(projects: Project[]): {
  grid: CardProject[];
  listed: Project[];
} {
  const grid: CardProject[] = [];
  const listed: Project[] = [];
  for (const project of [...projects].sort(newestFirst)) {
    const images = project.data.blocks.flatMap((block) =>
      block.type === 'text' ? [] : block.images,
    );
    const cover = project.data.blocks.length > 0
      ? projectCover(project.data.thumbnail, images)
      : undefined;
    if (cover) grid.push({ ...project, cover });
    else listed.push(project);
  }
  return { grid, listed };
}

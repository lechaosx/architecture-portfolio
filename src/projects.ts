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

/**
 * The project as if images whose file is missing had never been added: an
 * image block they leave empty goes too, and a missing thumbnail counts as unset.
 */
export function withoutMissingImages(
  data: Project['data'],
  exists: (path: string) => boolean,
): Project['data'] {
  const thumbnail = data.thumbnail?.trim();
  return {
    ...data,
    thumbnail: thumbnail && exists(thumbnail) ? data.thumbnail : undefined,
    blocks: data.blocks.flatMap((block): Project['data']['blocks'] => {
      if (block.type === 'text') return [block];
      const images = block.images.filter(({ image }) => exists(image));
      return images.length > 0 ? [{ ...block, images }] : [];
    }),
  };
}

/** Latest period first, then by English title, so both languages list projects alike. */
export const newestFirst = (a: Project, b: Project) =>
  latestFirst(a.data, b.data) || a.data.title.en.localeCompare(b.data.title.en);

/** A card needs a cover and content blocks, because a project without blocks has no page. */
export function projectCard(project: Project): CardProject | undefined {
  const images = project.data.blocks.flatMap((block) =>
    block.type === 'text' ? [] : block.images,
  );
  const cover = project.data.blocks.length > 0
    ? projectCover(project.data.thumbnail, images)
    : undefined;
  return cover && { ...project, cover };
}

export function workProjects(projects: Project[]): {
  grid: CardProject[];
  listed: Project[];
} {
  const grid: CardProject[] = [];
  const listed: Project[] = [];
  for (const project of [...projects].sort(newestFirst)) {
    const card = projectCard(project);
    if (card) grid.push(card);
    else listed.push(project);
  }
  return { grid, listed };
}

/**
 * The cards of the projects chosen by file path, in the chosen order. A choice
 * that is no published project, has no card or repeats an earlier one is left
 * out and reported by its position.
 */
export function chosenCards(paths: string[], projects: Array<Project & { filePath?: string }>) {
  const cards: CardProject[] = [];
  const issues: { index: number; message: string }[] = [];
  paths.forEach((path, index) => {
    const project = projects.find(({ filePath }) => filePath === path);
    const card = project && projectCard(project);
    if (!project) issues.push({ index, message: `${path} is a draft or no longer exists` });
    else if (!card) issues.push({ index, message: `${path} has no card (no image or no page content)` });
    else if (cards.some(({ id }) => id === card.id)) issues.push({ index, message: `${path} is already chosen above` });
    else cards.push(card);
  });
  return { cards, issues };
}

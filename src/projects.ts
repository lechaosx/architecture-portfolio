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
 * `found` says whether the file at an image's path exists, given that path and the image's field.
 */
export function withoutMissingImages(
  data: Project['data'],
  found: (path: string, field: string) => boolean,
): Project['data'] {
  const thumbnail = data.thumbnail?.trim();
  return {
    ...data,
    thumbnail: thumbnail && found(thumbnail, 'thumbnail') ? data.thumbnail : undefined,
    blocks: data.blocks.flatMap((block, blockIndex): Project['data']['blocks'] => {
      if (block.type === 'text') return [block];
      const images = block.images.filter(({ image }, index) => found(image, `blocks[${blockIndex}].images[${index}].image`));
      return images.length > 0 ? [{ ...block, images }] : [];
    }),
  };
}

/** The images a save from before the CMS required titles left untitled, each at its field. */
export function untitledImages(data: Pick<Project['data'], 'blocks'>) {
  return data.blocks.flatMap((block, blockIndex) =>
    block.type === 'text'
      ? []
      : block.images.flatMap(({ image, title }, index) =>
          title ? [] : [{ field: `blocks[${blockIndex}].images[${index}].title`, message: `${image} has no title` }],
        ),
  );
}

/**
 * The projects the site shows: no drafts, and no images whose file is missing.
 * `found` says whether the file at an image's path exists, given that path and
 * where the entry names it.
 */
export function publishedProjects<T extends Project & { filePath?: string }>(
  entries: T[],
  found: (path: string, location: string) => boolean,
): T[] {
  return entries
    .filter(({ data }) => !data.draft)
    .map((entry) => ({
      ...entry,
      data: withoutMissingImages(entry.data, (path, field) => found(path, `${entry.filePath}: ${field}`)),
    }));
}

/** Latest period first, then by English title, so both languages list projects alike. */
export const newestFirst = (a: Project, b: Project) =>
  latestFirst(a.data, b.data) || a.data.title.en.localeCompare(b.data.title.en);

/** A project's own page shows its content blocks, so a project without any has no page. */
export const hasPage = (data: Pick<Project['data'], 'blocks'>) => data.blocks.length > 0;

/** A card needs a cover and a page to link to. */
export function projectCard(project: Project): CardProject | undefined {
  const images = project.data.blocks.flatMap((block) =>
    block.type === 'text' ? [] : block.images,
  );
  const cover = hasPage(project.data)
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

import type { CollectionEntry } from 'astro:content';

export type GalleryImage = CollectionEntry<'projects'>['data']['gallery'][number];

export function hasCaption(image: GalleryImage) {
  return [
    image.title_cs,
    image.title_en,
    image.description_cs,
    image.description_en,
  ].some((value) => Boolean(value?.trim()));
}

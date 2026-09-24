import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const withoutEmptyCmsRows = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item) =>
          item === null ||
          typeof item !== 'object' ||
          Array.isArray(item) ||
          Object.keys(item).length > 0,
      )
    : value;

const projectImage = z.object({
  image: z.string(),
  comparison_set: z.string().optional(),
  title_cs: z.string().optional(),
  title_en: z.string().optional(),
  description_cs: z.string().optional(),
  description_en: z.string().optional(),
});

const projectImages = z.preprocess(
  withoutEmptyCmsRows,
  z.array(projectImage).min(1),
);

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title_cs: z.string(),
    title_en: z.string(),
    year: z.number(),
    location_cs: z.string().optional(),
    location_en: z.string().optional(),
    draft: z.boolean().default(false),
    // Image paths live under /public (served from root), so plain strings.
    cover: z.string(),
    blocks: z.preprocess(
      withoutEmptyCmsRows,
      z
        .array(
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('text'),
              body_cs: z.string(),
              body_en: z.string(),
            }),
            z.object({
              type: z.literal('gallery'),
              images: projectImages,
            }),
            z.object({
              type: z.literal('image_set'),
              images: projectImages,
            }),
          ]),
        )
        .default([]),
    ),
  }),
});

export const collections = { projects };

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

// Each singleton is one Markdown file, read as the one entry of its own
// collection.
const singletons = './src/content/singletons';

const site = defineCollection({
  loader: glob({ pattern: 'site.md', base: singletons }),
  schema: z.object({
    name: z.string(),
    credential: z.string().optional(),
    description_cs: z.string().optional(),
    description_en: z.string().optional(),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: 'home.md', base: singletons }),
  schema: z.object({
    portrait: z.string().optional(),
    gallery: z.array(z.string()).min(1),
    approaches: z.preprocess(
      withoutEmptyCmsRows,
      z
        .array(
          z.object({
            label_cs: z.string(),
            label_en: z.string(),
            text_cs: z.string(),
            text_en: z.string(),
            icon: z.enum(['place', 'scale', 'material', 'thinking']),
          }),
        )
        .default([]),
    ),
    body_cs: z.string(),
    body_en: z.string(),
  }),
});

const contact = defineCollection({
  loader: glob({ pattern: 'contact.md', base: singletons }),
  schema: z.object({
    email: z.string(),
    phone: z.string().optional(),
    hours: z.preprocess(
      withoutEmptyCmsRows,
      z
        .array(
          z.object({
            day_cs: z.string(),
            day_en: z.string(),
            hours: z.string(),
          }),
        )
        .default([]),
    ),
  }),
});

export const collections = { projects, site, home, contact };

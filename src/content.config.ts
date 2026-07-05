import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    location: z.string().optional(),
    order: z.number().default(0),
    draft: z.boolean().default(false),
    // Image paths live under /public (served from root), so plain strings.
    cover: z.string(),
    gallery: z.array(z.string()).default([]),
  }),
});

export const collections = { projects };

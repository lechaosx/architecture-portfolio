import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    gallery: z.array(z.string()).default([]),
    // Bilingual descriptions live in frontmatter (Markdown strings) rather than
    // the file body, so both languages can coexist; rendered with `marked`.
    body_cs: z.string(),
    body_en: z.string(),
  }),
});

export const collections = { projects };

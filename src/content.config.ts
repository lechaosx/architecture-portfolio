import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { DATE } from './period';
import { PROJECT_URL } from './project-facts';

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

const date = z.string().regex(DATE, 'Expected a year or month/year, e.g. 2023 or 3/2023');
const period = { from: date.optional(), to: date.optional() };

/** Text with something to read. The CMS's `pattern` in .pages.yml mirrors it. */
export const TEXT = /\S/;

const text = z.string().regex(TEXT, 'Expected text, not only whitespace');
// A translatable field: both languages, or neither where optional, as Pages CMS saves it.
const bilingual = z.object({ cs: text, en: text });

const projectImage = z.object({
  // Image paths live under /public (served from root), so plain strings.
  image: z.string(),
  comparison_set: z.string().optional(),
  title: bilingual.optional(),
  description: bilingual.optional(),
});

const projectImages = z.preprocess(
  withoutEmptyCmsRows,
  z.array(projectImage).min(1),
);

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: bilingual,
    thumbnail: z.string().optional(),
    from: date,
    to: date.optional(),
    location: bilingual.optional(),
    project_url: z.union([z.string().regex(PROJECT_URL, 'Expected an http or https address, e.g. https://example.org'), z.literal('')]).optional(),
    brief: bilingual.optional(),
    context: z.array(z.enum(['academic', 'competition', 'commissioned', 'self_initiated'])).default([]),
    intervention: z.array(z.enum(['new_build', 'renovation', 'extension', 'adaptive_reuse'])).default([]),
    scope: z.array(z.enum(['architecture', 'interior', 'landscape', 'public_space', 'urban_design'])).default([]),
    design_in_progress: z.boolean().default(false),
    realization: z.enum(['planned', 'construction', 'built']).optional(),
    studio: z.string().optional(),
    role: bilingual.optional(),
    collaborators: z.preprocess(
      withoutEmptyCmsRows,
      z
        .array(
          z.object({
            name: z.string(),
            role: bilingual.optional(),
          }),
        )
        .default([]),
    ),
    award: bilingual.optional(),
    draft: z.boolean().default(false),
    blocks: z.preprocess(
      withoutEmptyCmsRows,
      z
        .array(
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('text'),
              body: bilingual,
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
    description: bilingual,
  }),
});

const landing = defineCollection({
  loader: glob({ pattern: 'landing.md', base: singletons }),
  schema: z.object({
    images: z.array(z.string()).default([]),
    // Project file paths from the repository root, as Pages CMS references store them.
    projects: z.array(z.string()).default([]),
  }),
});

const factRow = z.object({
  place: bilingual,
  department: bilingual.optional(),
  ...period,
  title: bilingual,
  description: bilingual.optional(),
});
const facts = z.preprocess(withoutEmptyCmsRows, z.array(factRow).default([]));

const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: singletons }),
  schema: z.object({
    portrait: z.string().optional(),
    approaches: z.preprocess(
      withoutEmptyCmsRows,
      z
        .array(
          z.object({
            label: bilingual,
            text: bilingual,
            icon: z.enum(['place', 'scale', 'material', 'thinking']),
          }),
        )
        .default([]),
    ),
    body: bilingual,
    experience: facts,
    services: z.preprocess(
      withoutEmptyCmsRows,
      z.array(z.object({ name: bilingual })).default([]),
    ),
    education: facts,
    awards: facts,
  }),
});

const contact = defineCollection({
  loader: glob({ pattern: 'contact.md', base: singletons }),
  schema: z.object({
    email: z.string(),
    phone: z.string().optional(),
    location: bilingual.optional(),
    hours: bilingual.optional(),
  }),
});

export const collections = { projects, site, landing, about, contact };

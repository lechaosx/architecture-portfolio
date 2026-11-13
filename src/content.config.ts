import { createHash } from 'node:crypto';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { slug } from 'github-slugger';
import { DATE } from './period';
import { PROJECT_URL } from './project-facts';

/**
 * Frontmatter as the architect entered it in Pages CMS.
 *
 * Pages CMS writes YAML 1.2, which leaves text such as `2024-05-01` or `0b101` unquoted; Astro
 * reads frontmatter with js-yaml, which makes those a Date and a number. No field holds a date or a
 * number, so each becomes text again: a real date as typed, a time as an ISO timestamp, a number in
 * decimal. Lists drop the empty rows the CMS saves.
 */
const asEntered = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString().replace(/T00:00:00\.000Z$/, '');
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    // Mapped before filtering: a Date has no keys, so it would read as an empty row.
    return value
      .map(asEntered)
      .filter((item) => item === null || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, asEntered(field)]));
  }
  return value;
};

const frontmatter = <Shape extends z.ZodRawShape>(shape: Shape) => z.preprocess(asEntered, z.object(shape));

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
  // The CMS requires a title, but an image saved untitled before it did still builds, and
  // `untitledImages` reports it; `requiredInCms` tells the content-schema test.
  title: bilingual.optional().meta({ requiredInCms: true }),
  description: bilingual.optional(),
});

const projectImages = z.array(projectImage).min(1);

/**
 * My role was a single pair before it became a list, and the CMS can save one
 * until it picks up the new config from GitHub's push webhook; it reads as one
 * role. The CMS shows that shape as an empty list and would drop it on the next
 * save, so the warning asks for the file to be fixed. It names the text, not
 * the file: the schema cannot see it.
 */
const roles = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  console.warn(`role ${JSON.stringify(value)}: a single pair, read as one role; make it a list item, or the CMS drops it on the next save`);
  return [value];
}, z.array(bilingual).default([]));

/** A project's id and URL slug; see ARCHITECTURE.md → "A project id never comes out empty". */
export const projectId = ({ entry }: { entry: string }) =>
  entry
    .replace(/\.md$/, '')
    .split('/')
    .map((segment) => slug(segment) || createHash('sha256').update(segment).digest('hex').slice(0, 8))
    .join('/')
    .replace(/\/index$/, '');

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects', generateId: projectId }),
  schema: frontmatter({
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
    role: roles,
    collaborators: z
      .array(
        z.object({
          name: z.string(),
          role: bilingual.optional(),
        }),
      )
      .default([]),
    award: bilingual.optional(),
    draft: z.boolean().default(false),
    blocks: z
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
  }),
});

// Each singleton is one Markdown file, read as the one entry of its own
// collection.
const singletons = './src/content/singletons';

const site = defineCollection({
  loader: glob({ pattern: 'site.md', base: singletons }),
  schema: frontmatter({
    name: z.string(),
    credential: z.string().optional(),
    description: bilingual,
  }),
});

const landing = defineCollection({
  loader: glob({ pattern: 'landing.md', base: singletons }),
  schema: frontmatter({
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
const facts = z.array(factRow).default([]);

const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: singletons }),
  schema: frontmatter({
    portrait: z.string().optional(),
    approaches: z
      .array(
        z.object({
          label: bilingual,
          text: bilingual,
          icon: z.enum(['place', 'scale', 'material', 'thinking']),
        }),
      )
      .default([]),
    bio: bilingual,
    experience: facts,
    services: z.array(z.object({ name: bilingual })).default([]),
    education: facts,
    awards: facts,
  }),
});

const contact = defineCollection({
  loader: glob({ pattern: 'contact.md', base: singletons }),
  schema: frontmatter({
    email: z.string(),
    phone: z.string().optional(),
    location: bilingual.optional(),
    hours: bilingual.optional(),
    ico: z.string().optional(),
    seat: z.string().optional(),
  }),
});

export const collections = { projects, site, landing, about, contact };

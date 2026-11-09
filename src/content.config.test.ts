import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'astro/zod';
import { collections, TEXT } from './content.config';
import { DATE } from './period';
import { PROJECT_URL } from './project-facts';

const projectSchema = staticSchema('projects');

interface CmsField {
  name: string;
  type?: string;
  required?: boolean;
  pattern?: { regex: string; message: string };
  list?: boolean | { min?: number };
  options?: { multiple?: boolean; values?: Array<{ name: string }> };
  fields?: CmsField[];
  blocks?: Array<{ name: string; fields?: CmsField[] }>;
}

const pagesConfig = parse(readFileSync('.pages.yml', 'utf8')) as {
  content: Array<{
    name: string;
    fields?: CmsField[];
  }>;
};
const projectsEditor = pagesConfig.content.find(
  (entry) => entry.name === 'projects',
);
if (!projectsEditor?.fields) throw new TypeError('Expected a projects editor');
const projectEditorFields = projectsEditor.fields;

function staticSchema(name: keyof typeof collections) {
  const schema = collections[name].schema;
  if (!schema || typeof schema === 'function') {
    throw new TypeError(`Expected a static ${name} schema`);
  }
  return schema;
}

function frontmatter(path: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8'));
  if (!match) throw new TypeError(`Expected frontmatter in ${path}`);
  return parse(match[1]);
}

/** A field, whether it may be left out, and the fields of its rows or blocks. */
interface FieldShape {
  name: string;
  required?: boolean;
  fields?: FieldShape[];
}

const byName = (first: FieldShape, second: FieldShape) =>
  first.name.localeCompare(second.name);

function editorShape(fields: CmsField[]): FieldShape[] {
  return fields
    .map((field) => ({
      name: field.name,
      required: field.required === true,
      fields: field.fields
        ? editorShape(field.fields)
        : field.blocks
            ?.map((block) => ({ name: block.name, fields: editorShape(block.fields ?? []) }))
            .sort(byName),
    }))
    .sort(byName);
}

function schemaShape(shape: Record<string, z.ZodType>, discriminator?: string): FieldShape[] {
  return Object.entries(shape)
    .filter(([name]) => name !== discriminator)
    .map(([name, schema]) => ({
      name,
      required: !schema.safeParse(undefined).success,
      fields: rowShape(schema),
    }))
    .sort(byName);
}

/** The fields of a list's rows or blocks, through preprocessing, defaults and optionality. */
function rowShape(schema: z.ZodType): FieldShape[] | undefined {
  if (schema instanceof z.ZodPipe) return rowShape(schema.out as z.ZodType);
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional) {
    return rowShape(schema.unwrap() as z.ZodType);
  }
  if (schema instanceof z.ZodArray) return rowShape(schema.element as z.ZodType);
  if (schema instanceof z.ZodObject) return schemaShape(schema.shape);
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const key = schema.def.discriminator;
    return (schema.options as z.ZodObject[])
      .map((option) => ({
        name: String((option.shape[key] as z.ZodLiteral).value),
        fields: schemaShape(option.shape, key),
      }))
      .sort(byName);
  }
  return undefined;
}

const imageSet = {
  type: 'image_set',
  images: [{ image: '/uploads/cover.jpg' }],
};

const project = {
  title: { cs: 'Projekt', en: 'Project' },
  from: '2026',
  to: '2026',
  blocks: [imageSet],
};

describe.each(['projects', 'site', 'landing', 'about', 'contact'] as const)('%s schema', (name) => {
  test('declares the same fields as Pages CMS, required in the same places', () => {
    const editor = pagesConfig.content.find((entry) => entry.name === name);
    expect(editorShape(editor?.fields ?? [])).toEqual(rowShape(staticSchema(name)));
  });
});

const webAddresses = ['https://example.org/projects/library?view=plan#drawings', 'http://example.org/library', 'https://www.example-studio.cz'];
// The last three look like web addresses, but `new URL`, which reads the hostname for the fact sheet, throws on them.
const nonWebAddresses = ['not a URL', '/projects/library/', 'example.org/library', 'https:example.org', 'https:/example.org', 'javascript:alert(1)', 'data:text/html,hello', 'mailto:architect@example.org', 'ftp://example.org/library', ' https://example.org', 'https://example.123', 'https://example.org:99999', 'https://[::1'];

test('the project URL in Pages CMS takes the addresses the build takes, or nothing', () => {
  const pattern = new RegExp(projectEditorFields.find((field) => field.name === 'project_url')!.pattern!.regex);
  expect(pattern.test('')).toBe(true);
  for (const text of [...webAddresses, ...nonWebAddresses]) {
    expect(pattern.test(text), text).toBe(PROJECT_URL.test(text));
  }
});

test('every translation in Pages CMS takes the text the build takes, or nothing', () => {
  const translations = (fields: CmsField[]): CmsField[] =>
    fields.flatMap((field) => [
      ...(field.fields?.map(({ name }) => name).sort().join() === 'cs,en' ? field.fields : []),
      ...translations(field.fields ?? []),
      ...(field.blocks ?? []).flatMap((block) => translations(block.fields ?? [])),
    ]);
  const fields = pagesConfig.content.flatMap((entry) => translations(entry.fields ?? []));
  expect(fields.length).toBeGreaterThan(0);
  for (const field of fields) {
    const pattern = new RegExp(field.pattern!.regex);
    expect(pattern.test(''), `${field.name} left empty`).toBe(true);
    for (const text of ['Brno', ' Brno ', '\nBrno', ' ', ' \n\t ', '\u00a0', '&nbsp;']) {
      expect(pattern.test(text), `${field.name}: ${JSON.stringify(text)}`).toBe(TEXT.test(text));
    }
  }
});

test('every period date in Pages CMS takes the dates the build takes, or nothing', () => {
  const dates = (fields: CmsField[]): CmsField[] =>
    fields.flatMap((field) => [
      ...(['from', 'to'].includes(field.name) ? [field] : []),
      ...dates(field.fields ?? []),
    ]);
  const fields = pagesConfig.content.flatMap((entry) => dates(entry.fields ?? []));
  expect(fields.length).toBeGreaterThan(0);
  for (const field of fields) {
    const pattern = new RegExp(field.pattern!.regex);
    expect(pattern.test(''), `${field.name} left empty`).toBe(true);
    for (const text of ['2023', '3/2023', '03/2023', '12/2023', '0/2023', '13/2023', '3/', '2023/3', '23', ' 2023']) {
      expect(pattern.test(text), `${field.name}: ${text}`).toBe(DATE.test(text));
    }
  }
});

describe('project content schema', () => {
  test.each([undefined, '', '  ', '/uploads/selected.jpg'])('accepts an optional language-neutral thumbnail: %s', (thumbnail) => {
    expect(projectSchema.safeParse({ ...project, thumbnail })).toMatchObject({
      success: true, data: { thumbnail },
    });
  });

  test('the CMS exposes an optional thumbnail image picker', () => {
    expect(projectEditorFields.find((field) => field.name === 'thumbnail')).toMatchObject({
      type: 'image', required: false,
    });
  });

  test.each([
    ['no content blocks', undefined],
    ['only an empty CMS block row', [{}]],
    ['only text', [{ type: 'text', body: { cs: 'Popis', en: 'Description' } }]],
  ])('accepts a project with %s', (_, blocks) => {
    expect(projectSchema.safeParse({ ...project, blocks }).success).toBe(true);
  });

  test('accepts a brief in both languages', () => {
    const brief = { cs: 'Stručně', en: 'Briefly' };
    expect(projectSchema.safeParse({ ...project, brief })).toMatchObject({ success: true, data: { brief } });
  });

  test('reads credits, award and status, dropping empty CMS rows', () => {
    const credits = {
      context: ['competition'],
      studio: 'Ateliér A',
      collaborators: [
        { name: 'Jan Novák', role: { cs: 'Autor návrhu', en: 'Design author' } },
        { name: 'Eva Dvořáková', role: { cs: 'Autor návrhu', en: 'Design author' } },
        { name: 'Ing. Petr Malý', role: { cs: 'vizualizace', en: 'Visualizations' } },
        { name: 'Ing. Iva Tichá' },
      ],
      award: { cs: 'Odměna', en: 'Special mention' },
    };
    expect(
      projectSchema.safeParse({ ...project, ...credits, collaborators: [{}, ...credits.collaborators] }),
    ).toMatchObject({ success: true, data: credits });
  });

  test('leaves collaborators empty when omitted', () => {
    expect(projectSchema.safeParse(project)).toMatchObject({
      success: true,
      data: { collaborators: [] },
    });
  });

  test.each([undefined, '', ...webAddresses])('accepts an optional project website: %s', (project_url) => {
    expect(projectSchema.safeParse({ ...project, project_url })).toMatchObject({
      success: true,
      data: { project_url },
    });
  });

  test.each(nonWebAddresses)('rejects a non-web project URL: %s', (project_url) => {
    expect(projectSchema.safeParse({ ...project, project_url }).success).toBe(false);
  });

  test.each([
    ['a context outside the list', { context: ['professional'] }],
    ['a realization outside the list', { realization: 'cancelled' }],
    ['multiple realization states', { realization: ['planned', 'built'] }],
    ['an intervention outside the list', { intervention: ['study'] }],
    ['a scope outside the list', { scope: ['housing'] }],
    ['non-boolean design activity', { design_in_progress: 'yes' }],
    ['a collaborator without a name', { collaborators: [{ role: { cs: 'statika', en: 'Structures' } }] }],
    ['a non-record collaborator', { collaborators: ['Jana'] }],
  ])('rejects %s', (_, fields) => {
    expect(projectSchema.safeParse({ ...project, ...fields }).success).toBe(false);
  });

  test('treats an empty CMS block row as no content', () => {
    expect(
      projectSchema.safeParse({ ...project, blocks: [{}, imageSet] }),
    ).toMatchObject({
      success: true,
      data: { blocks: [imageSet] },
    });
  });

  test('accepts independently ordered text, gallery, and image-set blocks', () => {
    const blocks = [
      { type: 'text', body: { cs: 'Popis', en: 'Description' } },
      {
        type: 'gallery',
        images: [{ image: '/uploads/thumbnail.jpg' }],
      },
      {
        type: 'image_set',
        images: [
          {
            image: '/uploads/full-width.jpg',
            comparison_set: 'plans',
          },
        ],
      },
    ];
    expect(projectSchema.safeParse({ ...project, blocks })).toMatchObject({
      success: true,
      data: { blocks },
    });
  });

  test.each([
    ['without a start', { from: undefined, to: undefined }],
    ['with a month that is none', { from: '13/2026' }],
  ])('rejects a project %s', (_, period) => {
    expect(projectSchema.safeParse({ ...project, ...period }).success).toBe(false);
  });

  test('accepts a project ending before it starts, which the CMS cannot refuse', () => {
    expect(projectSchema.safeParse({ ...project, to: '2025' }).success).toBe(true);
  });

  test('rejects an image block without images', () => {
    const result = projectSchema.safeParse({
      ...project,
      blocks: [{ type: 'gallery', images: [] }],
    });

    expect(result.success).toBe(false);
  });

  test('exposes all project block types in Pages CMS', () => {
    expect(projectEditorFields.find((field) => field.name === 'blocks')).toMatchObject({
      type: 'block',
      blocks: [{ name: 'text' }, { name: 'gallery' }, { name: 'image_set' }],
    });
  });

  test('exposes comparison-set membership for both image block types', () => {
    const pageContent = projectEditorFields.find(
      (field) => field.name === 'blocks',
    );
    for (const blockName of ['gallery', 'image_set']) {
      const imageFields = pageContent?.blocks
        ?.find((block) => block.name === blockName)
        ?.fields?.find((field) => field.name === 'images')?.fields;
      expect(imageFields?.find((field) => field.name === 'comparison_set')).toMatchObject({
        type: 'string',
        required: false,
      });
    }
  });
});

test('site settings need the description in both languages, the landing page intro', () => {
  const settings = { name: 'Jana', description: { cs: 'Portfolio', en: 'Portfolio' } };
  expect(staticSchema('site').safeParse(settings).success).toBe(true);
  for (const language of ['cs', 'en']) {
    const description = { ...settings.description, [language]: undefined };
    expect(staticSchema('site').safeParse({ ...settings, description }).success, language).toBe(false);
  }
});

test('the landing page may have no images and no chosen projects', () => {
  expect(staticSchema('landing').safeParse({})).toMatchObject({
    success: true,
    data: { images: [], projects: [] },
  });
});

describe('about content schema', () => {
  const aboutSchema = staticSchema('about');
  const about = { body: { cs: 'O mně', en: 'About me' } };

  const row = {
    place: { cs: 'Fakulta stavební VUT v Brně', en: 'Faculty of Civil Engineering, Brno University of Technology' },
    department: { cs: 'Ústav architektury', en: 'Institute of Architecture' },
    from: '9/2024',
    to: '2026',
    title: { cs: 'Architektura a rozvoj sídel', en: 'Architecture and Urban Development' },
    description: { cs: 'Diplomová práce.', en: 'Diploma thesis.' },
  };
  const bare = { place: { cs: 'Ateliér', en: 'Studio' }, title: { cs: 'Stáž', en: 'Internship' } };

  test('reads fact rows and services, dropping empty CMS rows', () => {
    const facts = {
      experience: [bare],
      services: [{ name: { cs: 'Rodinné domy', en: 'Family houses' } }],
      education: [row],
      awards: [{ ...bare, from: '2025', to: '2025' }],
    };
    expect(
      aboutSchema.safeParse({
        ...about,
        ...facts,
        experience: [{}, ...facts.experience],
        services: [{}, ...facts.services],
        education: [row, {}],
      }),
    ).toMatchObject({ success: true, data: facts });
  });

  test('leaves the facts empty when they are not filled', () => {
    expect(aboutSchema.safeParse(about)).toMatchObject({
      success: true,
      data: { experience: [], services: [], education: [], awards: [] },
    });
  });

  test.each(['experience', 'education', 'awards'])(
    'rejects a %s row without its place or title',
    (field) => {
      for (const missing of ['place', 'title'] as const) {
        const { [missing]: _, ...partial } = bare;
        expect(aboutSchema.safeParse({ ...about, [field]: [partial] }).success, missing).toBe(false);
      }
    },
  );

  test.each(['experience', 'education', 'awards'])('accepts a %s row whose period the CMS cannot check', (field) => {
    for (const period of [{ to: '2024' }, { from: '2024', to: '2023' }]) {
      expect(aboutSchema.safeParse({ ...about, [field]: [{ ...bare, ...period }] }).success, JSON.stringify(period)).toBe(true);
    }
  });

  test('rejects a service in only one language', () => {
    expect(aboutSchema.safeParse({ ...about, services: [{ name: { cs: 'Interiéry' } }] }).success).toBe(false);
  });
});

test('contact reads where she is and when she is reachable, one line per language', () => {
  const lines = {
    location: { cs: 'Brno', en: 'Brno' },
    hours: { cs: 'Po–Pá 10–15', en: 'Mon–Fri 10–15' },
  };
  expect(
    staticSchema('contact').safeParse({ email: 'jana@example.cz', ...lines }),
  ).toMatchObject({ success: true, data: lines });
});

test.each(['site', 'landing', 'about', 'contact'] as const)('the committed %s singleton is valid', (name) => {
  const content = frontmatter(`src/content/singletons/${name}.md`);
  expect(staticSchema(name).safeParse(content).success).toBe(true);
});

test.each(readdirSync('src/content/projects').filter((file) => file.endsWith('.md')))(
  'the committed project %s is valid',
  (file) => {
    expect(projectSchema.safeParse(frontmatter(`src/content/projects/${file}`))).toMatchObject({ success: true });
  },
);

const aboutContent = { body: { cs: 'O mně', en: 'About me' } };
const fact = { place: { cs: 'Ateliér', en: 'Studio' }, title: { cs: 'Stáž', en: 'Internship' } };

interface BilingualCase {
  name: string;
  collection: keyof typeof collections;
  content: Record<string, unknown>;
  path: Array<string | number>;
  pair: string;
  optional: boolean;
  /** The pair is all its row holds, so leaving it out leaves an empty CMS row. */
  wholeRow?: boolean;
}

const bilingualCases: BilingualCase[] = [
  ...['title', 'location', 'brief', 'role', 'award'].map((pair) => ({
    name: `project ${pair}`, collection: 'projects' as const, content: project,
    path: [], pair, optional: pair !== 'title',
  })),
  {
    name: 'collaborator role', collection: 'projects',
    content: { ...project, collaborators: [{ name: 'Jana' }, { name: 'Petr' }] },
    path: ['collaborators', 1], pair: 'role', optional: true,
  },
  {
    name: 'project text', collection: 'projects',
    content: { ...project, blocks: [imageSet, { type: 'text', body: { cs: 'Popis', en: 'Description' } }] },
    path: ['blocks', 1], pair: 'body', optional: false,
  },
  ...['gallery', 'image_set'].flatMap((type) => ['title', 'description'].map((pair) => ({
    name: `${type} image ${pair}`, collection: 'projects' as const,
    content: { ...project, blocks: [imageSet, { type, images: [{ image: '/uploads/first.jpg' }, { image: '/uploads/second.jpg' }] }] },
    path: ['blocks', 1, 'images', 1], pair, optional: true,
  }))),
  {
    name: 'site description', collection: 'site',
    content: { name: 'Jana', description: { cs: 'Portfolio', en: 'Portfolio' } },
    path: [], pair: 'description', optional: false,
  },
  {
    name: 'About body', collection: 'about', content: aboutContent,
    path: [], pair: 'body', optional: false,
  },
  ...['label', 'text'].map((pair) => ({
    name: `Approach ${pair}`, collection: 'about' as const,
    content: { ...aboutContent, approaches: [{ label: { cs: 'Místo', en: 'Place' }, text: { cs: 'Kontext', en: 'Context' }, icon: 'place' }] },
    path: ['approaches', 0], pair, optional: false,
  })),
  {
    name: 'service name', collection: 'about',
    content: { ...aboutContent, services: [{ name: { cs: 'Interiéry', en: 'Interiors' } }] },
    path: ['services', 0], pair: 'name', optional: false, wholeRow: true,
  },
  ...['experience', 'education', 'awards'].flatMap((field) =>
    ['place', 'title', 'department', 'description'].map((pair) => ({
      name: `${field} ${pair}`, collection: 'about' as const,
      content: { ...aboutContent, [field]: [{ ...fact }, { ...fact }] },
      path: [field, 1], pair, optional: pair === 'department' || pair === 'description',
    })),
  ),
  ...['location', 'hours'].map((pair) => ({
    name: `contact ${pair}`, collection: 'contact' as const,
    content: { email: 'jana@example.cz' }, path: [], pair, optional: true,
  })),
];

function withPair({ content, path, pair }: BilingualCase, value: unknown) {
  const input = structuredClone(content);
  let row: Record<string | number, unknown> = input;
  for (const key of path) row = row[key] as Record<string | number, unknown>;
  if (value === undefined) delete row[pair];
  else row[pair] = value;
  return input;
}

describe.each(bilingualCases)('$name translations', (entry) => {
  const parse = (value: unknown) => staticSchema(entry.collection).safeParse(withPair(entry, value));

  test('accepts both languages without changing their text', () => {
    const input = withPair(entry, { cs: ' Český text ', en: ' English text ' });
    expect(staticSchema(entry.collection).safeParse(input)).toMatchObject({ success: true, data: input });
  });

  test.each(['cs', 'en'])('rejects the pair without text in %s', (language) => {
    for (const text of [undefined, '', ' \n\t ']) {
      const result = parse({ cs: 'Český text', en: 'English text', [language]: text });
      expect(result.success, JSON.stringify(text)).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual([expect.objectContaining({ path: [...entry.path, entry.pair, language] })]);
      }
    }
  });

  if (entry.wholeRow) {
    test('left out, leaves an empty row, which is dropped', () => {
      expect(parse(undefined)).toMatchObject({ success: true, data: { [entry.path[0]]: [] } });
    });
  } else {
    test(entry.optional ? 'may be left out' : 'may not be left out', () => {
      expect(parse(undefined).success).toBe(entry.optional);
    });
  }
});


test('keeps project origin, design activity and realization independent', () => {
  const metadata = {
    context: ['academic', 'competition', 'commissioned', 'self_initiated'],
    intervention: ['new_build', 'renovation', 'extension', 'adaptive_reuse'],
    scope: ['architecture', 'interior', 'landscape', 'public_space', 'urban_design'],
    design_in_progress: true,
    realization: 'construction',
  };
  expect(projectSchema.safeParse({ ...project, ...metadata })).toMatchObject({ success: true, data: metadata });
});

test('unspecified classifications make no claims about the project', () => {
  const result = projectSchema.parse(project);
  expect(result).toMatchObject({ context: [], intervention: [], scope: [], design_in_progress: false });
  expect(result).not.toHaveProperty('realization');
});


test('CMS controlled choices and multiplicity match project metadata validation', () => {
  for (const name of ['context', 'intervention', 'scope', 'realization']) {
    const field = projectEditorFields.find((field) => field.name === name)!;
    const multiple = name !== 'realization';
    expect(field.options?.multiple === true).toBe(multiple);
    for (const option of field.options?.values ?? []) {
      const value = multiple ? [option.name] : option.name;
      expect(projectSchema.parse({ ...project, [name]: value })).toHaveProperty(name, value);
    }
  }
});


test('project collaborators exclude the portfolio owner', () => {
  const owner = frontmatter('src/content/singletons/site.md').name;
  const projects = readdirSync('src/content/projects').filter((file) => file.endsWith('.md'));
  for (const file of projects) {
    const data = projectSchema.parse(frontmatter(`src/content/projects/${file}`));
    if (!('collaborators' in data)) throw new TypeError('Expected project content');
    expect(data.collaborators.filter(({ name }) => name.trim() === owner), file).toHaveLength(0);
  }
});

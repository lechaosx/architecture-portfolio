import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'astro/zod';
import { collections } from './content.config';
import { DATE } from './period';

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
  title_cs: 'Projekt',
  title_en: 'Project',
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
  test.each([
    ['no content blocks', undefined],
    ['only an empty CMS block row', [{}]],
    ['only text', [{ type: 'text', body_cs: 'Popis', body_en: 'Description' }]],
  ])('accepts a project with %s', (_, blocks) => {
    expect(projectSchema.safeParse({ ...project, blocks }).success).toBe(true);
  });

  test('accepts a brief in both languages', () => {
    expect(
      projectSchema.safeParse({ ...project, brief_cs: 'Stručně', brief_en: 'Briefly' }),
    ).toMatchObject({ success: true, data: { brief_cs: 'Stručně', brief_en: 'Briefly' } });
  });

  test('reads credits, award and status, dropping empty CMS rows', () => {
    const credits = {
      context: ['competition'],
      studio: 'Ateliér A',
      team: [
        { name: 'Jan Novák', role_cs: 'Autor návrhu', role_en: 'Design author' },
        { name: 'Eva Dvořáková', role_cs: 'Autor návrhu', role_en: 'Design author' },
        { name: 'Ing. Petr Malý', role_cs: 'vizualizace', role_en: 'Visualizations' },
        { name: 'Ing. Iva Tichá' },
      ],
      award_cs: 'Odměna',
      award_en: 'Special mention',
    };
    expect(
      projectSchema.safeParse({ ...project, ...credits, team: [{}, ...credits.team] }),
    ).toMatchObject({ success: true, data: credits });
  });

  test('leaves the team empty when it is not filled', () => {
    expect(projectSchema.safeParse(project)).toMatchObject({
      success: true,
      data: { team: [] },
    });
  });

  test.each([
    ['a context outside the list', { context: ['professional'] }],
    ['a realization outside the list', { realization: 'cancelled' }],
    ['multiple realization states', { realization: ['planned', 'built'] }],
    ['an intervention outside the list', { intervention: ['study'] }],
    ['a scope outside the list', { scope: ['housing'] }],
    ['non-boolean design activity', { design_in_progress: 'yes' }],
    ['a team member without a name', { team: [{ role_cs: 'statika', role_en: 'Structures' }] }],
    ['an old string team member', { team: ['Jana'] }],
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
      { type: 'text', body_cs: 'Popis', body_en: 'Description' },
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
    ['ending before it starts', { to: '2025' }],
  ])('rejects a project %s', (_, period) => {
    expect(projectSchema.safeParse({ ...project, ...period }).success).toBe(false);
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
  const settings = { name: 'Jana', description_cs: 'Portfolio', description_en: 'Portfolio' };
  expect(staticSchema('site').safeParse(settings).success).toBe(true);
  for (const field of ['description_cs', 'description_en']) {
    expect(staticSchema('site').safeParse({ ...settings, [field]: undefined }).success, field).toBe(false);
  }
});

test('the landing page may have no images', () => {
  expect(staticSchema('landing').safeParse({})).toMatchObject({
    success: true,
    data: { images: [] },
  });
});

describe('about content schema', () => {
  const aboutSchema = staticSchema('about');
  const about = { body_cs: 'O mně', body_en: 'About me' };

  const row = {
    place_cs: 'Fakulta stavební VUT v Brně',
    place_en: 'Faculty of Civil Engineering, Brno University of Technology',
    department_cs: 'Ústav architektury',
    department_en: 'Institute of Architecture',
    from: '9/2024',
    to: '2026',
    title_cs: 'Architektura a rozvoj sídel',
    title_en: 'Architecture and Urban Development',
    description_cs: 'Diplomová práce.',
    description_en: 'Diploma thesis.',
  };
  const bare = { place_cs: 'Ateliér', place_en: 'Studio', title_cs: 'Stáž', title_en: 'Internship' };

  test('reads fact rows and services, dropping empty CMS rows', () => {
    const facts = {
      experience: [bare],
      services: [{ name_cs: 'Rodinné domy', name_en: 'Family houses' }],
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
    'rejects a %s row without its place or title in both languages',
    (field) => {
      for (const missing of ['place_cs', 'place_en', 'title_cs', 'title_en']) {
        const { [missing as keyof typeof bare]: _, ...partial } = bare;
        expect(aboutSchema.safeParse({ ...about, [field]: [partial] }).success, missing).toBe(false);
      }
    },
  );

  test.each(['experience', 'education', 'awards'])('rejects a %s row whose period ends without a start', (field) => {
    expect(aboutSchema.safeParse({ ...about, [field]: [{ ...bare, to: '2024' }] }).success).toBe(false);
  });

  test('rejects a service in only one language', () => {
    expect(aboutSchema.safeParse({ ...about, services: [{ name_cs: 'Interiéry' }] }).success).toBe(false);
  });
});

test('contact reads where she is and when she is reachable, one line per language', () => {
  const lines = {
    location_cs: 'Brno',
    location_en: 'Brno',
    hours_cs: 'Po–Pá 10–15',
    hours_en: 'Mon–Fri 10–15',
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

const aboutContent = { body_cs: 'O mně', body_en: 'About me' };
const fact = { place_cs: 'Ateliér', place_en: 'Studio', title_cs: 'Stáž', title_en: 'Internship' };

interface BilingualCase {
  name: string;
  collection: keyof typeof collections;
  content: Record<string, unknown>;
  path: Array<string | number>;
  pair: string;
  optional: boolean;
}

const bilingualCases: BilingualCase[] = [
  ...['title', 'location', 'brief', 'award'].map((pair) => ({
    name: `project ${pair}`, collection: 'projects' as const, content: project,
    path: [], pair, optional: pair !== 'title',
  })),
  {
    name: 'team member role', collection: 'projects',
    content: { ...project, team: [{ name: 'Jana' }, { name: 'Petr' }] },
    path: ['team', 1], pair: 'role', optional: true,
  },
  {
    name: 'project text', collection: 'projects',
    content: { ...project, blocks: [imageSet, { type: 'text', body_cs: 'Popis', body_en: 'Description' }] },
    path: ['blocks', 1], pair: 'body', optional: false,
  },
  ...['gallery', 'image_set'].flatMap((type) => ['title', 'description'].map((pair) => ({
    name: `${type} image ${pair}`, collection: 'projects' as const,
    content: { ...project, blocks: [imageSet, { type, images: [{ image: '/uploads/first.jpg' }, { image: '/uploads/second.jpg' }] }] },
    path: ['blocks', 1, 'images', 1], pair, optional: true,
  }))),
  {
    name: 'site description', collection: 'site',
    content: { name: 'Jana', description_cs: 'Portfolio', description_en: 'Portfolio' },
    path: [], pair: 'description', optional: false,
  },
  {
    name: 'About body', collection: 'about', content: aboutContent,
    path: [], pair: 'body', optional: false,
  },
  ...['label', 'text'].map((pair) => ({
    name: `Approach ${pair}`, collection: 'about' as const,
    content: { ...aboutContent, approaches: [{ label_cs: 'Místo', label_en: 'Place', text_cs: 'Kontext', text_en: 'Context', icon: 'place' }] },
    path: ['approaches', 0], pair, optional: false,
  })),
  {
    name: 'service name', collection: 'about',
    content: { ...aboutContent, services: [{ name_cs: 'Interiéry', name_en: 'Interiors' }] },
    path: ['services', 0], pair: 'name', optional: false,
  },
  ...['experience', 'education', 'awards'].flatMap((field) =>
    ['place', 'title', 'department', 'description'].map((pair) => ({
      name: `${field} ${pair}`, collection: 'about' as const,
      content: { ...aboutContent, [field]: [fact, fact] },
      path: [field, 1], pair, optional: pair === 'department' || pair === 'description',
    })),
  ),
  ...['location', 'hours'].map((pair) => ({
    name: `contact ${pair}`, collection: 'contact' as const,
    content: { email: 'jana@example.cz' }, path: [], pair, optional: true,
  })),
];

function withPair({ content, path, pair }: BilingualCase, cs: unknown, en: unknown) {
  const input = structuredClone(content);
  let row: Record<string | number, unknown> = input;
  for (const key of path) row = row[key] as Record<string | number, unknown>;
  for (const [language, value] of [['cs', cs], ['en', en]]) {
    if (value === undefined) delete row[`${pair}_${language}`];
    else row[`${pair}_${language}`] = value;
  }
  return input;
}

describe.each(bilingualCases)('$name translations', (entry) => {
  test.each(['cs', 'en'])('a filled %s value requires a meaningful counterpart', (language) => {
    for (const missing of [undefined, '', ' \n\t ']) {
      const result = staticSchema(entry.collection).safeParse(withPair(
        entry,
        language === 'cs' ? 'Český text' : missing,
        language === 'en' ? 'English text' : missing,
      ));
      expect(result.success, `${language}, counterpart ${JSON.stringify(missing)}`).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(expect.arrayContaining([
          expect.objectContaining({ path: [...entry.path, `${entry.pair}_${language === 'cs' ? 'en' : 'cs'}`] }),
        ]));
      }
    }
  });

  test('accepts both translations without changing their text', () => {
    const input = withPair(entry, ' Český text ', ' English text ');
    expect(staticSchema(entry.collection).safeParse(input)).toMatchObject({ success: true, data: input });
  });

  if (entry.optional) {
    test('allows an optional pair to be absent or empty in both languages', () => {
      for (const [cs, en] of [[undefined, undefined], ['', ''], [' \n\t', ' '], [undefined, ''], ['', undefined]]) {
        expect(staticSchema(entry.collection).safeParse(withPair(entry, cs, en)).success).toBe(true);
      }
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


test('all project teams include the portfolio owner once', () => {
  const owner = frontmatter('src/content/singletons/site.md').name;
  const projects = readdirSync('src/content/projects').filter((file) => file.endsWith('.md'));
  for (const file of projects) {
    const data = projectSchema.parse(frontmatter(`src/content/projects/${file}`));
    if (!('team' in data)) throw new TypeError('Expected project content');
    expect(data.team.filter(({ name }) => name.trim() === owner), file).toHaveLength(1);
  }
});

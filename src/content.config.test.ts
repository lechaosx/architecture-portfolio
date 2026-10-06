import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'astro/zod';
import { collections } from './content.config';

const projectSchema = staticSchema('projects');

interface CmsField {
  name: string;
  type?: string;
  required?: boolean;
  list?: boolean | { min?: number };
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
  year: 2026,
  blocks: [imageSet],
};

describe.each(['projects', 'site', 'about', 'contact'] as const)('%s schema', (name) => {
  test('declares the same fields as Pages CMS, required in the same places', () => {
    const editor = pagesConfig.content.find((entry) => entry.name === name);
    expect(editorShape(editor?.fields ?? [])).toEqual(rowShape(staticSchema(name)));
  });
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

describe('about content schema', () => {
  const aboutSchema = staticSchema('about');
  const about = { body_cs: 'O mně', body_en: 'About me' };

  const row = {
    place_cs: 'Fakulta stavební VUT v Brně',
    place_en: 'Faculty of Civil Engineering, Brno University of Technology',
    department_cs: 'Ústav architektury',
    department_en: 'Institute of Architecture',
    years: '2024–2026',
    title_cs: 'Architektura a rozvoj sídel',
    title_en: 'Architecture and Urban Development',
    description_cs: 'Diplomová práce.',
    description_en: 'Diploma thesis.',
    tags: [{ name_cs: 'Urbanismus', name_en: 'Urbanism' }],
  };
  const bare = { place_cs: 'Ateliér', place_en: 'Studio', title_cs: 'Stáž', title_en: 'Internship' };

  test('reads timeline rows and services, dropping empty CMS rows', () => {
    const facts = {
      experience: [bare],
      services: [{ name_cs: 'Rodinné domy', name_en: 'Family houses' }],
      education: [row],
      awards: [{ ...bare, years: '2025' }],
    };
    expect(
      aboutSchema.safeParse({
        ...about,
        ...facts,
        experience: [{}, ...facts.experience],
        services: [{}, ...facts.services],
        education: [{ ...row, tags: [{}, ...row.tags] }, {}],
      }),
    ).toMatchObject({ success: true, data: { ...facts, experience: [{ ...bare, tags: [] }] } });
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

  test.each([
    ['services', { name_cs: 'Interiéry' }],
    ['tags', { name_cs: 'BIM' }],
  ])('rejects %s in only one language', (field, badge) => {
    const value = field === 'services' ? { services: [badge] } : { awards: [{ ...bare, tags: [badge] }] };
    expect(aboutSchema.safeParse({ ...about, ...value }).success).toBe(false);
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

test.each(['site', 'about', 'contact'] as const)('the committed %s singleton is valid', (name) => {
  const content = frontmatter(`src/content/singletons/${name}.md`);
  expect(staticSchema(name).safeParse(content).success).toBe(true);
});

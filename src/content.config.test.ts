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
const homeEditor = pagesConfig.content.find((entry) => entry.name === 'home');
if (!homeEditor?.fields) throw new TypeError('Expected a home editor');
const homeEditorFields = homeEditor.fields;

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

const project = {
  title_cs: 'Projekt',
  title_en: 'Project',
  year: 2026,
  cover: '/uploads/cover.jpg',
};

describe.each(['projects', 'site', 'home', 'contact'] as const)('%s schema', (name) => {
  test('declares the same fields as Pages CMS, required in the same places', () => {
    const editor = pagesConfig.content.find((entry) => entry.name === name);
    expect(editorShape(editor?.fields ?? [])).toEqual(rowShape(staticSchema(name)));
  });
});

describe('project content schema', () => {
  test('allows a project with no content blocks', () => {
    expect(projectSchema.safeParse(project)).toMatchObject({
      success: true,
      data: { blocks: [] },
    });
  });

  test('treats an empty CMS block row as no content', () => {
    expect(projectSchema.safeParse({ ...project, blocks: [{}] })).toMatchObject({
      success: true,
      data: { blocks: [] },
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

describe('home content schema', () => {
  test('requires an explicit non-empty homepage image selection', () => {
    expect(homeEditorFields.find((field) => field.name === 'gallery')).toMatchObject({
      type: 'image',
      required: true,
      list: { min: 1 },
    });
  });
});

test.each(['site', 'home', 'contact'] as const)('the committed %s singleton is valid', (name) => {
  const content = frontmatter(`src/content/singletons/${name}.md`);
  expect(staticSchema(name).safeParse(content).success).toBe(true);
});

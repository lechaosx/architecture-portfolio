import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';

mock.module('astro:content', () => ({
  defineCollection: <T>(collection: T) => collection,
  z,
}));

const { collections } = await import('./content.config');
const projectSchema = collections.projects.schema;
if (!projectSchema || typeof projectSchema === 'function') {
  throw new TypeError('Expected a static project schema');
}

interface CmsField {
  name: string;
  type?: string;
  required?: boolean;
  list?: boolean | { min?: number };
  fields?: CmsField[];
  blocks?: Array<{ name: string; fields?: CmsField[] }>;
}

const pagesConfig = Bun.YAML.parse(readFileSync('.pages.yml', 'utf8')) as {
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

const project = {
  title_cs: 'Projekt',
  title_en: 'Project',
  year: 2026,
  cover: '/uploads/cover.jpg',
};

describe('project content schema', () => {
  test('marks every build-required field as required in Pages CMS', () => {
    for (const name of [
      'title_cs',
      'title_en',
      'year',
      'cover',
    ]) {
      expect(
        projectEditorFields.find((field) => field.name === name),
      ).toMatchObject({ required: true });
    }
  });

  test('allows a project with no content blocks', () => {
    const result = projectSchema.safeParse(project);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.blocks).toEqual([]);
  });

  test('treats an empty CMS block row as no content', () => {
    const result = projectSchema.safeParse({ ...project, blocks: [{}] });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.blocks).toEqual([]);
  });

  test('accepts independently ordered text, gallery, and image-set blocks', () => {
    const blocks = [
      { type: 'text' as const, body_cs: 'Popis', body_en: 'Description' },
      {
        type: 'gallery' as const,
        images: [{ image: '/uploads/thumbnail.jpg' }],
      },
      {
        type: 'image_set' as const,
        images: [
          {
            image: '/uploads/full-width.jpg',
            comparison_set: 'plans',
          },
        ],
      },
    ];
    const result = projectSchema.safeParse({ ...project, blocks });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.blocks).toEqual(blocks);
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

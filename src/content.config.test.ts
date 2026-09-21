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

const pagesConfig = Bun.YAML.parse(readFileSync('.pages.yml', 'utf8')) as {
  content: Array<{
    name: string;
    fields?: Array<{
      name: string;
      type?: string;
      required?: boolean;
      blocks?: Array<{ name: string }>;
    }>;
  }>;
};
const projectsEditor = pagesConfig.content.find(
  (entry) => entry.name === 'projects',
);
if (!projectsEditor?.fields) throw new TypeError('Expected a projects editor');
const projectEditorFields = projectsEditor.fields;

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
        images: [{ image: '/uploads/full-width.jpg' }],
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
});

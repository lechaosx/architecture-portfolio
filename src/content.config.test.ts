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
    fields?: Array<{ name: string; required?: boolean }>;
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
  body_cs: 'Popis',
  body_en: 'Description',
};

describe('project content schema', () => {
  test('marks every build-required field as required in Pages CMS', () => {
    for (const name of [
      'title_cs',
      'title_en',
      'year',
      'cover',
      'body_cs',
      'body_en',
    ]) {
      expect(
        projectEditorFields.find((field) => field.name === name),
      ).toMatchObject({ required: true });
    }
  });

  test('allows a project with no gallery images', () => {
    const result = projectSchema.safeParse(project);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gallery).toEqual([]);
  });

  test('treats an empty CMS gallery row as no image', () => {
    const result = projectSchema.safeParse({ ...project, gallery: [{}] });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gallery).toEqual([]);
  });

  test('rejects a non-empty gallery row without an image', () => {
    const result = projectSchema.safeParse({
      ...project,
      gallery: [{ title_en: 'Missing image' }],
    });

    expect(result.success).toBe(false);
  });
});

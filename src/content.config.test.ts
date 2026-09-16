import { describe, expect, mock, test } from 'bun:test';
import { z } from 'astro/zod';

mock.module('astro:content', () => ({
  defineCollection: <T>(collection: T) => collection,
  z,
}));

const { collections } = await import('./content.config');
const projectSchema = collections.projects.schema;

const project = {
  title_cs: 'Projekt',
  title_en: 'Project',
  year: 2026,
  cover: '/uploads/cover.jpg',
  body_cs: 'Popis',
  body_en: 'Description',
};

describe('project content schema', () => {
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

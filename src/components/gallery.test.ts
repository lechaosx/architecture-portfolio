import { describe, expect, test } from 'bun:test';
import { hasCaption, type GalleryImage } from './gallery';

const image = (caption: Partial<GalleryImage> = {}): GalleryImage => ({
  image: '/uploads/project.jpg',
  ...caption,
});

describe('hasCaption', () => {
  test('is false when all optional caption fields are empty', () => {
    expect(hasCaption(image())).toBe(false);
    expect(hasCaption(image({ title_cs: ' ', description_en: '' }))).toBe(false);
  });

  test.each([
    { title_cs: 'Nadpis' },
    { title_en: 'Title' },
    { description_cs: 'Popis' },
    { description_en: 'Description' },
  ])('is true when a caption field is present', (caption) => {
    expect(hasCaption(image(caption))).toBe(true);
  });
});

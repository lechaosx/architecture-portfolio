import { describe, expect, test } from 'bun:test';
import {
  clampPan,
  hasCaption,
  panForZoom,
  scaleFromWheel,
  swipeDirection,
  type GalleryImage,
} from './gallery';

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

describe('lightbox gestures', () => {
  test('wheel zoom stays between 1x and 5x', () => {
    expect(scaleFromWheel(1, -100)).toBeGreaterThan(1);
    expect(scaleFromWheel(5, -100)).toBe(5);
    expect(scaleFromWheel(1, 100)).toBe(1);
  });

  test('wheel zoom keeps the image point beneath the pointer', () => {
    expect(
      panForZoom({ x: 0, y: 0 }, 1, 2, { x: 100, y: -50 }),
    ).toEqual({ x: -100, y: 50 });
  });

  test('panning cannot move the scaled image beyond the viewport', () => {
    expect(
      clampPan(
        { x: 500, y: -500 },
        2,
        { width: 800, height: 600 },
        { width: 1000, height: 700 },
      ),
    ).toEqual({ x: 300, y: -250 });
  });

  test('horizontal swipes navigate only after the threshold', () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(80, 10)).toBe(-1);
    expect(swipeDirection(40, 5)).toBe(0);
    expect(swipeDirection(80, 100)).toBe(0);
  });
});

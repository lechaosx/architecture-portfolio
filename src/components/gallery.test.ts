import { describe, expect, test } from 'bun:test';
import {
  clampPan,
  hasCaption,
  lightboxImageUrl,
  panForPinch,
  panForZoom,
  scaleFromPinch,
  scaleFromWheel,
  swipeDirection,
  type GalleryImage,
} from './gallery';
import type { ResponsiveImage } from '../images';

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

  test('pinch zoom follows finger distance and stays within the zoom limits', () => {
    expect(scaleFromPinch(1, 100, 250)).toBe(2.5);
    expect(scaleFromPinch(4, 100, 200)).toBe(5);
    expect(scaleFromPinch(2, 100, 25)).toBe(1);
  });

  test('pinch zoom keeps its starting image point beneath the moving midpoint', () => {
    expect(
      panForPinch(
        { x: 0, y: 0 },
        1,
        2,
        { x: 100, y: -50 },
        { x: 120, y: -40 },
      ),
    ).toEqual({ x: -80, y: 60 });
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

describe('lightbox image selection', () => {
  const responsiveImage: ResponsiveImage = {
    source: {
      url: '/uploads/project.jpg',
      width: 4000,
      height: 3000,
      bytes: 4_000_000,
      format: 'jpeg',
    },
    variants: [640, 1280, 2560].map((width) => ({
      url: `/_responsive/project/${width}.webp`,
      width,
      height: width * 0.75,
      bytes: width * 100,
      format: 'webp',
    })),
  };

  test('chooses the smallest preview that covers the rendered pixels', () => {
    expect(
      lightboxImageUrl(responsiveImage, { width: 800, height: 600 }, 1, 1),
    ).toBe('/_responsive/project/1280.webp');
    expect(
      lightboxImageUrl(responsiveImage, { width: 800, height: 600 }, 1, 2),
    ).toBe('/_responsive/project/2560.webp');
  });

  test('uses the original when zoom exceeds the largest preview', () => {
    expect(
      lightboxImageUrl(responsiveImage, { width: 800, height: 600 }, 4, 1),
    ).toBe('/uploads/project.jpg');
  });
});

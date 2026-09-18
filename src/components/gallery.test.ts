import { describe, expect, test } from 'bun:test';
import {
  clampPan,
  containedImageSize,
  deepZoomViewport,
  focusWrapTarget,
  galleryImageHash,
  galleryImageIndex,
  galleryThumbnailSizes,
  hasCaption,
  lightboxImageUrl,
  nativeZoomScale,
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

describe('gallery thumbnail image selection', () => {
  test('accounts for the landscape crop when describing a square thumbnail', () => {
    expect(galleryThumbnailSizes(16 / 9)).toBe(
      '(min-width: 896px) 488.8889px, (min-width: 640px) calc(59.2593vw - 42.6667px), calc(88.8889vw - 53.3333px)',
    );
  });

  test('keeps the default slot dimensions without a landscape aspect ratio', () => {
    const expected =
      '(min-width: 896px) 275px, (min-width: 640px) calc(33.3333vw - 24px), calc(50vw - 30px)';

    expect(galleryThumbnailSizes(1)).toBe(expected);
    expect(galleryThumbnailSizes(9 / 16)).toBe(expected);
  });
});

describe('lightbox gestures', () => {
  test('wheel zoom stays between 1x and the native-detail limit', () => {
    expect(scaleFromWheel(1, -100, 4)).toBeGreaterThan(1);
    expect(scaleFromWheel(4, -100, 4)).toBe(4);
    expect(scaleFromWheel(1, 100, 4)).toBe(1);
  });

  test('wheel zoom keeps the image point beneath the pointer', () => {
    expect(
      panForZoom({ x: 0, y: 0 }, 1, 2, { x: 100, y: -50 }),
    ).toEqual({ x: -100, y: 50 });
  });

  test('pinch zoom follows finger distance and stays within the zoom limits', () => {
    expect(scaleFromPinch(1, 100, 250, 4)).toBe(2.5);
    expect(scaleFromPinch(3, 100, 200, 4)).toBe(4);
    expect(scaleFromPinch(2, 100, 25, 4)).toBe(1);
  });

  test('native zoom matches source pixels to physical display pixels', () => {
    expect(nativeZoomScale(3000, 750, 2)).toBe(2);
    expect(nativeZoomScale(640, 750, 2)).toBe(1);
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

  test('panning stays locked at the base scale', () => {
    expect(
      clampPan(
        { x: 200, y: -100 },
        1,
        { width: 800, height: 500 },
        { width: 1000, height: 700 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  test('fits landscape and portrait images inside the stage', () => {
    expect(
      containedImageSize(
        { width: 4000, height: 2000 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ width: 800, height: 400 });
    expect(
      containedImageSize(
        { width: 2000, height: 4000 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ width: 300, height: 600 });
  });

  test('maps immediate image transforms to a deep-zoom viewport', () => {
    expect(
      deepZoomViewport(
        0.5,
        { x: 0.5, y: 0.25 },
        1000,
        2,
        { x: 100, y: -50 },
      ),
    ).toEqual({ zoom: 1, center: { x: 0.4, y: 0.3 } });
  });

  test('horizontal swipes navigate only after the threshold', () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(80, 10)).toBe(-1);
    expect(swipeDirection(40, 5)).toBe(0);
    expect(swipeDirection(80, 100)).toBe(0);
  });
});

describe('lightbox focus trap', () => {
  test('wraps focus at both ends of the dialog', () => {
    expect(focusWrapTarget(0, 4, true)).toBe(3);
    expect(focusWrapTarget(3, 4, false)).toBe(0);
  });

  test('lets the browser move focus between interior controls', () => {
    expect(focusWrapTarget(1, 4, false)).toBeUndefined();
    expect(focusWrapTarget(2, 4, true)).toBeUndefined();
  });

  test('moves focus into the dialog if it escaped', () => {
    expect(focusWrapTarget(-1, 4, false)).toBe(0);
    expect(focusWrapTarget(-1, 4, true)).toBe(3);
  });
});

describe('lightbox URLs', () => {
  test('uses one-based image hashes', () => {
    expect(galleryImageHash(0)).toBe('#image-1');
    expect(galleryImageHash(11)).toBe('#image-12');
  });

  test('resolves valid image hashes to zero-based indexes', () => {
    expect(galleryImageIndex('#image-1', 12)).toBe(0);
    expect(galleryImageIndex('#image-12', 12)).toBe(11);
  });

  test.each(['', '#image-0', '#image-13', '#image-1-more', '#other-1'])(
    'ignores invalid or out-of-range hash %s',
    (hash) => {
      expect(galleryImageIndex(hash, 12)).toBeUndefined();
    },
  );
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
    variants: [640, 1280, 2560, 4000].map((width) => ({
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

  test('keeps a processed native-resolution image at maximum zoom', () => {
    expect(
      lightboxImageUrl(responsiveImage, { width: 800, height: 600 }, 4, 2),
    ).toBe('/_responsive/project/4000.webp');
  });
});

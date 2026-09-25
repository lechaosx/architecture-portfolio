import { describe, expect, test } from 'bun:test';
import {
  clampPan,
  clampScale,
  comparisonSetIndexes,
  containedImageSize,
  deepZoomViewport,
  displayedSwipeOffset,
  doubleTapScale,
  galleryImageHash,
  galleryImageIndex,
  imageText,
  lightboxAreas,
  lightboxImageUrl,
  nativeZoomScale,
  panForPinch,
  panForZoom,
  scaleFromPinch,
  scaleFromWheel,
  sharedMaximumScale,
  swipeDirection,
  zoomFloor,
  type GalleryImage,
} from './gallery';
import type { ResponsiveImage } from '../images';

const image = (caption: Partial<GalleryImage> = {}): GalleryImage => ({
  image: '/uploads/project.jpg',
  ...caption,
});

describe('imageText', () => {
  test('reads the field in the requested language', () => {
    const captioned = image({ title_cs: 'Nadpis', description_en: ' Description ' });
    expect(imageText(captioned, 'title', 'cs')).toBe('Nadpis');
    expect(imageText(captioned, 'description', 'en')).toBe('Description');
  });

  test('treats a missing or blank field as absent', () => {
    expect(imageText(image({ title_cs: 'Nadpis' }), 'title', 'en')).toBeUndefined();
    expect(imageText(image({ description_en: '  ' }), 'description', 'en')).toBeUndefined();
    expect(imageText(undefined, 'title', 'en')).toBeUndefined();
  });
});

describe('lightboxAreas', () => {
  test('bands use the edge gap clamp and the control size', () => {
    // 1440×900: gap = clamp(8, 0.012 × 900, 16) = 10.8
    const areas = lightboxAreas({ width: 1440, height: 900 });
    expect(areas.gap).toBeCloseTo(10.8);
    expect(areas.band).toBeCloseTo(61.6);
    expect(areas.rest).toEqual({ width: 1440, height: 900 - 2 * areas.band });
    expect(areas.safe).toEqual({
      width: 1440 - 2 * areas.band,
      height: 900 - 2 * areas.band,
    });
  });

  test('the gap is clamped on tiny and huge viewports', () => {
    expect(lightboxAreas({ width: 320, height: 568 }).gap).toBe(8);
    expect(lightboxAreas({ width: 2560, height: 1440 }).gap).toBe(16);
  });
});

describe('zoomFloor', () => {
  test('is 1 when the rest image already fits the safe area', () => {
    expect(
      zoomFloor({ width: 700, height: 700 }, { width: 1200, height: 750 }),
    ).toBe(1);
  });

  test('lets a full-width rest image shrink until it clears the side bands', () => {
    expect(
      zoomFloor({ width: 390, height: 390 }, { width: 278, height: 732 }),
    ).toBeCloseTo(278 / 390);
  });
});

describe('doubleTapScale', () => {
  test('zooms in to 2.5 or the ceiling, and returns to rest from any other scale', () => {
    expect(doubleTapScale(1, { min: 1, max: 4 })).toBe(2.5);
    expect(doubleTapScale(1, { min: 1, max: 1.6 })).toBe(1.6);
    expect(doubleTapScale(3, { min: 1, max: 4 })).toBe(1);
    expect(doubleTapScale(0.8, { min: 0.7, max: 4 })).toBe(1);
  });
});

describe('zoom range', () => {
  test('wheel and pinch respect a floor below 1', () => {
    expect(scaleFromWheel(1, 1000, { min: 0.7, max: 4 })).toBe(0.7);
    expect(scaleFromPinch(1, 200, 20, { min: 0.7, max: 4 })).toBe(0.7);
  });

  test('a stepped scale stays within the range', () => {
    expect(clampScale(1.25, { min: 0.7, max: 4 })).toBe(1.25);
    expect(clampScale(5, { min: 0.7, max: 4 })).toBe(4);
    expect(clampScale(0.5, { min: 0.7, max: 4 })).toBe(0.7);
  });
});

describe('clampPan against the soft inset', () => {
  test('a zoomed image edge can reach the safe edge but not beyond', () => {
    // rest image 1440 wide at 2× = 2880; safe width 1316.8 → max |pan.x| = (2880 − 1316.8) / 2
    const pan = clampPan(
      { x: 10_000, y: 0 },
      2,
      { width: 1440, height: 776.8 },
      {
        rest: { width: 1440, height: 776.8 },
        safe: { width: 1316.8, height: 776.8 },
      },
    );
    expect(pan.x).toBeCloseTo((2880 - 1316.8) / 2);
  });

  test('an axis no larger than the rest area stays centred under the side bands', () => {
    expect(
      clampPan(
        { x: 40, y: 0 },
        0.9,
        { width: 390, height: 390 },
        {
          rest: { width: 390, height: 732 },
          safe: { width: 278, height: 732 },
        },
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('lightbox gestures', () => {
  test('wheel zoom stays between 1x and the native-detail limit', () => {
    expect(scaleFromWheel(1, -100, { min: 1, max: 4 })).toBeGreaterThan(1);
    expect(scaleFromWheel(4, -100, { min: 1, max: 4 })).toBe(4);
    expect(scaleFromWheel(1, 100, { min: 1, max: 4 })).toBe(1);
  });

  test('wheel zoom keeps the image point beneath the pointer', () => {
    expect(
      panForZoom({ x: 0, y: 0 }, 1, 2, { x: 100, y: -50 }),
    ).toEqual({ x: -100, y: 50 });
  });

  test('pinch zoom follows finger distance and stays within the zoom limits', () => {
    expect(scaleFromPinch(1, 100, 250, { min: 1, max: 4 })).toBe(2.5);
    expect(scaleFromPinch(3, 100, 200, { min: 1, max: 4 })).toBe(4);
    expect(scaleFromPinch(2, 100, 25, { min: 1, max: 4 })).toBe(1);
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
    const viewport = { width: 1000, height: 700 };
    expect(
      clampPan(
        { x: 500, y: -500 },
        2,
        { width: 800, height: 600 },
        { rest: viewport, safe: viewport },
      ),
    ).toEqual({ x: 300, y: -250 });
  });

  test('panning stays locked at the base scale', () => {
    const viewport = { width: 1000, height: 700 };
    expect(
      clampPan(
        { x: 200, y: -100 },
        1,
        { width: 800, height: 500 },
        { rest: viewport, safe: viewport },
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
    // A 500 px rest image at 2× spans the whole 1000 px container: zoom 1.
    expect(
      deepZoomViewport({ x: 0.5, y: 0.25 }, 1000, 1000, { x: 100, y: -50 }),
    ).toEqual({ zoom: 1, center: { x: 0.4, y: 0.3 } });
  });

  test('horizontal swipes navigate only after the threshold', () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(80, 10)).toBe(-1);
    expect(swipeDirection(40, 5)).toBe(0);
    expect(swipeDirection(80, 100)).toBe(0);
  });

  test('reduced motion keeps a swipe stationary until navigation', () => {
    expect(displayedSwipeOffset(80, false)).toBe(80);
    expect(displayedSwipeOffset(80, true)).toBe(0);
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

describe('comparison sets', () => {
  const images = [
    image({ comparison_set: 'site-plan' }),
    image(),
    image({ comparison_set: ' site-plan ' }),
    image({ comparison_set: 'sections' }),
  ];

  test('finds every image in the current image set in page order', () => {
    expect(comparisonSetIndexes(images, 0)).toEqual([0, 2]);
    expect(comparisonSetIndexes(images, 2)).toEqual([0, 2]);
  });

  test('does not expose a shortcut for an ungrouped or single-member image', () => {
    expect(comparisonSetIndexes(images, 1)).toEqual([]);
    expect(comparisonSetIndexes(images, 3)).toEqual([]);
  });

  test('limits shared zoom to the least detailed set member', () => {
    expect(sharedMaximumScale([4, 2.5, 3])).toBe(2.5);
    expect(sharedMaximumScale([])).toBe(1);
  });
});

describe('lightbox image selection', () => {
  const responsiveImage: ResponsiveImage = {
    originalUrl: '/uploads/project.jpg',
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

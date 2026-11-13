import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
  deepZoomLevels,
  deepZoomOverlap,
  derivativeWidths,
  displaySourceUrl,
  imageCacheKey,
  shouldPublishDerivative,
  shouldGenerateDeepZoom,
  staleOutputs,
  webpPolicy,
} from './image-cache';

const source = new Uint8Array([1, 2, 3]);
const recipe = { width: 640, format: 'webp' };

describe('imageCacheKey', () => {
  test('is stable for identical source bytes and recipes', () => {
    expect(imageCacheKey(source, recipe)).toBe(imageCacheKey(source, recipe));
  });

  test('changes when the source image changes', () => {
    expect(imageCacheKey(source, recipe)).not.toBe(
      imageCacheKey(new Uint8Array([1, 2, 4]), recipe),
    );
  });

  test('changes when the transformation recipe changes', () => {
    expect(imageCacheKey(source, recipe)).not.toBe(
      imageCacheKey(source, { ...recipe, width: 1280 }),
    );
  });
});

describe('derivative selection', () => {
  test('gives an upload with a plus sign a display URL the dev and preview servers resolve', () => {
    expect(
      displaySourceUrl('/uploads/Plan%2Bchanges.webp', 'abc123', 'webp'),
    ).toBe('/_responsive/abc123/source.webp');
    expect(
      displaySourceUrl('/uploads/P%C5%AFdorys%201.NP.png', 'abc123', 'png'),
    ).toBe('/uploads/P%C5%AFdorys%201.NP.png');
  });

  test('ends the derivative ladder at the native source width', () => {
    expect(derivativeWidths(640, [320, 480, 640, 960])).toEqual([
      320, 480, 640,
    ]);
  });

  test('publishes a derivative only when it is smaller than the source file', () => {
    expect(shouldPublishDerivative(1_000, 999)).toBe(true);
    expect(shouldPublishDerivative(1_000, 1_000)).toBe(false);
    expect(shouldPublishDerivative(1_000, 1_001)).toBe(false);
  });

  test('preserves lossless and alpha-bearing sources losslessly', () => {
    expect(webpPolicy('png', false, source)).toEqual({ lossless: true, effort: 4 });
    expect(webpPolicy('jpeg', true, source)).toEqual({ lossless: true, effort: 4 });
  });

  test('keeps lossless WebP sources lossless, with or without extended chunks', async () => {
    const pixels = sharp({
      create: { width: 8, height: 8, channels: 3, background: '#808080' },
    });
    const simple = await pixels.clone().webp({ lossless: true }).toBuffer();
    const extended = await pixels
      .clone()
      .withIccProfile('srgb')
      .webp({ lossless: true })
      .toBuffer();
    const lossy = await pixels.clone().webp({ quality: 90 }).toBuffer();

    expect(webpPolicy('webp', false, simple)).toEqual({ lossless: true, effort: 4 });
    expect(webpPolicy('webp', false, extended)).toEqual({ lossless: true, effort: 4 });
    expect(webpPolicy('webp', false, lossy).lossless).toBe(false);
  });

  test('uses conservative lossy settings for already-lossy sources', () => {
    expect(webpPolicy('jpeg', false, source)).toEqual({
      lossless: false,
      quality: 90,
      alphaQuality: 100,
      smartSubsample: true,
      effort: 4,
      preset: 'picture',
    });
  });
});

describe('deep zoom eligibility', () => {
  test('uses pyramids only beyond the full-image preview range', () => {
    expect(shouldGenerateDeepZoom(4096, 3000)).toBe(false);
    expect(shouldGenerateDeepZoom(4097, 3000)).toBe(true);
    expect(shouldGenerateDeepZoom(3000, 4097)).toBe(true);
  });

  test('describes every DZI level at its exact rounded dimensions', () => {
    const levels = deepZoomLevels(4972, 3000);

    expect(levels.at(-1)).toEqual({ level: 13, width: 4972, height: 3000 });
    expect(levels.at(-2)).toEqual({ level: 12, width: 2486, height: 1500 });
    expect(levels.at(-3)).toEqual({ level: 11, width: 1243, height: 750 });
    expect(levels.at(-4)).toEqual({ level: 10, width: 622, height: 375 });
    expect(levels[0]).toEqual({ level: 0, width: 1, height: 1 });
  });

  test('keeps lossy tile boundaries one codec macroblock outside the visible core', () => {
    expect(deepZoomOverlap(true)).toBe(1);
    expect(deepZoomOverlap(false)).toBe(16);
  });
});

describe('output sync', () => {
  const published = new Set(['manifest.json', 'a/480.webp', 'a/960.webp']);

  test('keeps every published file and the directories that hold them', () => {
    expect(
      staleOutputs(['a', 'a/480.webp', 'a/960.webp', 'manifest.json'], published),
    ).toEqual([]);
  });

  test('removes a file that is no longer published from a kept directory', () => {
    expect(
      staleOutputs(['a', 'a/320.webp', 'a/480.webp', 'a/960.webp'], published),
    ).toEqual(['a/320.webp']);
  });

  test('removes a stale directory inside a kept directory', () => {
    expect(
      staleOutputs(
        ['a', 'a/480.webp', 'a/image_files', 'a/image_files/0'],
        published,
      ),
    ).toEqual(['a/image_files']);
  });

  test('removes a temporary file left by an interrupted run', () => {
    expect(
      staleOutputs(['a', 'a/480.webp', 'a/480.webp.tmp'], published),
    ).toEqual(['a/480.webp.tmp']);
  });

  test('removes an unreferenced directory as one entry', () => {
    expect(
      staleOutputs(
        ['a', 'a/480.webp', 'b', 'b/image.dzi', 'b/image_files', 'b/image_files/0'],
        published,
      ),
    ).toEqual(['b']);
  });
});

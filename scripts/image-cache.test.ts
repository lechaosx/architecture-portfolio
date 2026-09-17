import { describe, expect, test } from 'bun:test';
import {
  deepZoomLevels,
  deepZoomOverlap,
  derivativeWidths,
  imageCacheKey,
  shouldPublishDerivative,
  shouldGenerateDeepZoom,
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
    expect(webpPolicy('png', false)).toEqual({ lossless: true, effort: 4 });
    expect(webpPolicy('jpeg', true)).toEqual({ lossless: true, effort: 4 });
  });

  test('uses conservative lossy settings for already-lossy sources', () => {
    expect(webpPolicy('jpeg', false)).toEqual({
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

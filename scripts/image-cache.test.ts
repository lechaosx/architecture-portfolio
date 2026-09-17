import { describe, expect, test } from 'bun:test';
import {
  derivativeWidths,
  imageCacheKey,
  shouldPublishDerivative,
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
  test('only resamples widths smaller than the source', () => {
    expect(derivativeWidths(640, [320, 480, 640, 960])).toEqual([320, 480]);
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

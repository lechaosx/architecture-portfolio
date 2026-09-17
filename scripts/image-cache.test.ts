import { describe, expect, test } from 'bun:test';
import { imageCacheKey } from './image-cache';

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

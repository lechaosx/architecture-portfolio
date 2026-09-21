import { describe, expect, test } from 'bun:test';
import { uniqueProjectImages } from './project-images';

describe('uniqueProjectImages', () => {
  test('keeps the latest image record and maps every duplicate to it', () => {
    const result = uniqueProjectImages([
      { image: '/uploads/cover.jpg' },
      { image: '/uploads/drawing.jpg' },
      { image: '/uploads/cover.jpg', title_en: 'Latest caption' },
    ]);

    expect(result.images).toEqual([
      { image: '/uploads/drawing.jpg' },
      { image: '/uploads/cover.jpg', title_en: 'Latest caption' },
    ]);
    expect(result.indexes).toEqual([1, 0, 1]);
  });
});

import { describe, expect, test } from 'bun:test';
import { responsiveSrcset, type ResponsiveImage } from './images';

const plan: ResponsiveImage = {
  source: {
    url: '/uploads/P%C5%AFdorys%201.NP.png',
    width: 1000,
    height: 800,
    bytes: 900,
    format: 'png',
  },
  variants: [
    {
      url: '/_responsive/hash/320.webp',
      width: 320,
      height: 256,
      bytes: 100,
      format: 'webp',
    },
    {
      url: '/_responsive/hash/640.webp',
      width: 640,
      height: 512,
      bytes: 300,
      format: 'webp',
    },
  ],
};

describe('responsiveSrcset', () => {
  test('selects requested derivatives and includes the original', () => {
    expect(responsiveSrcset(plan, [320])).toBe(
      '/_responsive/hash/320.webp 320w, /uploads/P%C5%AFdorys%201.NP.png 1000w',
    );
  });

  test('omits srcset when an image has no manifest entry', () => {
    expect(responsiveSrcset(undefined, [320])).toBeUndefined();
  });
});

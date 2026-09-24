import { describe, expect, test } from 'bun:test';
import {
  coverSizes,
  displayImageUrl,
  responsiveSrcset,
  type ResponsiveImage,
} from './images';

const plan: ResponsiveImage = {
  originalUrl: '/uploads/P%C5%AFdorys%201.NP.png',
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
    {
      url: '/_responsive/hash/1000.webp',
      width: 1000,
      height: 800,
      bytes: 700,
      format: 'webp',
    },
  ],
};

describe('displayImageUrl', () => {
  test('uses a safe source alias only when it differs from the original URL', () => {
    expect(displayImageUrl(plan, '/uploads/Půdorys 1.NP.png')).toBe(
      '/uploads/Půdorys 1.NP.png',
    );
    expect(
      displayImageUrl(
        {
          ...plan,
          source: { ...plan.source, url: '/_responsive/hash/source.png' },
        },
        '/uploads/Plan+changes.png',
      ),
    ).toBe('/_responsive/hash/source.png');
  });
});

describe('responsiveSrcset', () => {
  test('uses a processed native-resolution derivative as its ceiling', () => {
    expect(responsiveSrcset(plan, [320])).toBe(
      '/_responsive/hash/320.webp 320w, /_responsive/hash/1000.webp 1000w',
    );
  });

  test('uses the original ceiling when native processing is not smaller', () => {
    expect(
      responsiveSrcset(
        { ...plan, variants: plan.variants.filter(({ width }) => width < 1000) },
        [320],
      ),
    ).toBe(
      '/_responsive/hash/320.webp 320w, /uploads/P%C5%AFdorys%201.NP.png 1000w',
    );
  });

  test('omits srcset when an image has no manifest entry', () => {
    expect(responsiveSrcset(undefined, [320])).toBeUndefined();
  });
});

describe('coverSizes', () => {
  const slots = [
    { media: '(min-width: 1152px)', fixed: 360 },
    { media: '(min-width: 640px)', viewport: 100 / 3, gutter: 24 },
    { viewport: 50, gutter: 30 },
  ];

  test('requests the source width used when a landscape image fills by height', () => {
    expect(coverSizes(16 / 9, 1, slots)).toBe(
      '(min-width: 1152px) 640px, (min-width: 640px) calc(59.2593vw - 42.6667px), calc(88.8889vw - 53.3333px)',
    );
  });

  test('keeps the box width when the image fills by width', () => {
    const expected =
      '(min-width: 1152px) 360px, (min-width: 640px) calc(33.3333vw - 24px), calc(50vw - 30px)';

    expect(coverSizes(1, 1, slots)).toBe(expected);
    expect(coverSizes(9 / 16, 1, slots)).toBe(expected);
  });

  test('includes enlargement applied by an image hover effect', () => {
    expect(
      coverSizes(4 / 3, 1, [{ fixed: 283 }, { viewport: 100, gutter: 48 }], 1.03),
    ).toBe('388.6533px, calc(137.3333vw - 65.92px)');
  });
});

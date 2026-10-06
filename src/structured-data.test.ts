import { describe, expect, test } from 'vitest';
import {
  creativeWork,
  jsonLd,
  person,
  profilePage,
  webSite,
} from './structured-data';
import type { ResponsiveImage } from './images';

const site = new URL('https://example.cz/');
const owner = { name: 'Jana Nováková', credential: 'Ing. arch.' };
const emptyAbout = { services: [], education: [], awards: [] };
const contact = { email: 'jana@example.cz' };

describe('person', () => {
  test('describes the architect from the content, in Czech', () => {
    expect(
      person({
        site,
        owner,
        about: {
          services: [{ name_cs: 'Rodinné domy', name_en: 'Family houses' }],
          education: [
            {
              place_cs: 'Fakulta stavební VUT v Brně',
              place_en: 'Faculty of Civil Engineering, BUT',
              department_cs: 'Ústav architektury',
              department_en: 'Institute of Architecture',
              years: '2024–2026',
              title_cs: 'Architektura a rozvoj sídel',
              title_en: 'Architecture and Urban Development',
              tags: [],
            },
            { place_cs: 'SPŠ stavební', place_en: 'Building school', years: ' ', title_cs: 'Maturita', title_en: 'School-leaving exam', tags: [] },
          ],
          awards: [{ place_cs: 'Cena Bohuslava Fuchse', place_en: 'Bohuslav Fuchs Award', years: '2025', title_cs: '2. místo', title_en: '2nd place', tags: [] }],
        },
        contact: { ...contact, phone: '+420 777 000 000', location_cs: 'Brno' },
        portrait: '/_responsive/hash/1280.webp',
      }),
    ).toEqual({
      '@type': 'Person',
      '@id': 'https://example.cz/#person',
      name: 'Jana Nováková',
      honorificPrefix: 'Ing. arch.',
      jobTitle: 'Architektka',
      url: 'https://example.cz/',
      email: 'jana@example.cz',
      telephone: '+420 777 000 000',
      image: 'https://example.cz/_responsive/hash/1280.webp',
      workLocation: { '@type': 'Place', name: 'Brno' },
      makesOffer: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Rodinné domy' } },
      ],
      hasCredential: [
        {
          '@type': 'EducationalOccupationalCredential',
          name: 'Architektura a rozvoj sídel, Fakulta stavební VUT v Brně (2024–2026)',
        },
        { '@type': 'EducationalOccupationalCredential', name: 'Maturita, SPŠ stavební' },
      ],
      award: ['Cena Bohuslava Fuchse, 2. místo (2025)'],
      knowsLanguage: ['cs', 'en'],
    });
  });

  test('leaves out what the content leaves empty', () => {
    const node = person({
      site,
      owner: { name: owner.name },
      about: {
        ...emptyAbout,
        awards: [{ place_cs: ' ', place_en: 'Competition', title_cs: '', title_en: 'Award', tags: [] }],
      },
      contact: { ...contact, location_cs: ' ' },
    });
    expect(Object.keys(node)).toEqual(['@type', '@id', 'name', 'jobTitle', 'url', 'email', 'knowsLanguage']);
  });
});

test('the work page is the website', () => {
  expect(webSite({ site, name: 'Ing. arch. Jana Nováková' })).toEqual({
    '@type': 'WebSite',
    '@id': 'https://example.cz/#website',
    name: 'Ing. arch. Jana Nováková',
    url: 'https://example.cz/',
    inLanguage: ['cs', 'en'],
  });
});

test('the about page is the architect’s profile', () => {
  expect(profilePage({ site, url: 'https://example.cz/about/' })).toEqual({
    '@type': 'ProfilePage',
    url: 'https://example.cz/about/',
    mainEntity: { '@id': 'https://example.cz/#person' },
  });
});

describe('creativeWork', () => {
  const project = {
    title_cs: 'Galerie',
    title_en: 'Gallery',
    year: 2024,
    location_cs: 'Brno',
    location_en: 'Brno',
  };

  // A drawing 4000px wide, with derivatives up to its own width.
  const drawing = (hash: string): ResponsiveImage => ({
    originalUrl: `/uploads/${hash}.png`,
    source: { url: `/uploads/${hash}.png`, width: 4000, height: 2000, bytes: 9, format: 'png' },
    variants: [1280, 1920, 2560, 4000].map((width) => ({
      url: `/_responsive/${hash}/${width}.webp`,
      width,
      height: width / 2,
      bytes: 1,
      format: 'webp',
    })),
    share: { url: `/_responsive/${hash}/share.jpg`, width: 1200, height: 600, bytes: 1, format: 'jpeg' },
  });

  test('describes the project, its cover and its described images, in Czech', () => {
    expect(
      creativeWork({
        site,
        url: 'https://example.cz/projects/galerie/',
        project,
        description: 'Anotace.',
        images: [
          { image: '/uploads/cover.png' },
          { image: '/uploads/Půdorys 1.svg', title_cs: 'Půdorys', title_en: 'Plan' },
          { image: '/uploads/untitled.png' },
          { image: '/uploads/rez.png', title_en: 'Section', description_cs: 'Popis řezu.' },
        ],
        responsiveImages: [drawing('cover'), undefined, drawing('untitled'), drawing('rez')],
      }),
    ).toEqual({
      '@type': 'CreativeWork',
      name: 'Galerie',
      dateCreated: '2024',
      locationCreated: { '@type': 'Place', name: 'Brno' },
      description: 'Anotace.',
      inLanguage: 'cs',
      url: 'https://example.cz/projects/galerie/',
      creator: { '@id': 'https://example.cz/#person' },
      image: [
        {
          '@type': 'ImageObject',
          contentUrl: 'https://example.cz/_responsive/cover/2560.webp',
        },
        {
          '@type': 'ImageObject',
          contentUrl: 'https://example.cz/uploads/P%C5%AFdorys%201.svg',
          name: 'Půdorys',
        },
        {
          '@type': 'ImageObject',
          contentUrl: 'https://example.cz/_responsive/rez/2560.webp',
          caption: 'Popis řezu.',
        },
      ],
    });
  });

  test('lists a titled cover once', () => {
    const { image } = creativeWork({
      site,
      url: 'https://example.cz/projects/galerie/',
      project,
      images: [{ image: '/uploads/cover.png', title_cs: 'Pohled' }],
      responsiveImages: [drawing('cover')],
    });
    expect(image).toEqual([
      {
        '@type': 'ImageObject',
        contentUrl: 'https://example.cz/_responsive/cover/2560.webp',
        name: 'Pohled',
      },
    ]);
  });

  test('leaves out what the project leaves empty', () => {
    expect(
      Object.keys(
        creativeWork({
          site,
          url: 'https://example.cz/projects/galerie/',
          project: { ...project, location_cs: undefined },
          images: [],
          responsiveImages: [],
        }),
      ),
    ).toEqual(['@type', 'name', 'dateCreated', 'inLanguage', 'url', 'creator']);
  });
});

describe('jsonLd', () => {
  test('is a schema.org graph', () => {
    expect(JSON.parse(jsonLd([{ '@type': 'Thing' }]))).toEqual({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'Thing' }],
    });
  });

  test('cannot close the script it is inlined in', () => {
    const name = '</script><script>alert(1)</script><!--';
    const serialized = jsonLd([{ name }]);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)['@graph'][0].name).toBe(name);
  });
});

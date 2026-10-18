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
              from: '2024',
              to: '2026',
              title_cs: 'Architektura a rozvoj sídel',
              title_en: 'Architecture and Urban Development',
            },
            { place_cs: 'SPŠ stavební', place_en: 'Building school', title_cs: 'Maturita', title_en: 'School-leaving exam' },
          ],
          awards: [
            { place_cs: 'Cena Bohuslava Fuchse', place_en: 'Bohuslav Fuchs Award', from: '2025', to: '2025', title_cs: '2. místo', title_en: '2nd place' },
            { place_cs: 'Soutěž', place_en: 'Competition', from: '9/2025', title_cs: 'Finále', title_en: 'Final' },
          ],
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
      award: ['Cena Bohuslava Fuchse, 2. místo (2025)', 'Soutěž, Finále (9/2025–dosud)'],
      knowsLanguage: ['cs', 'en'],
    });
  });

  test('leaves out what the content leaves empty', () => {
    const node = person({
      site,
      owner: { name: owner.name },
      about: {
        ...emptyAbout,
        awards: [{ place_cs: ' ', place_en: 'Competition', title_cs: '', title_en: 'Award' }],
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
    from: '2023',
    to: '6/2024',
    location_cs: 'Brno',
    location_en: 'Brno',
    team: [],
    collaborators: [],
  };
  const owner = 'Jana Nováková';

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
        owner,
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
      locationCreated: { '@type': 'Place', name: 'Brno' },
      description: 'Anotace.',
      inLanguage: 'cs',
      url: 'https://example.cz/projects/galerie/',
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
      owner,
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

  test('leaves out what the project leaves empty, and the date it was finished while it is ongoing', () => {
    expect(
      Object.keys(
        creativeWork({
          site,
          url: 'https://example.cz/projects/galerie/',
          owner,
          project: { ...project, location_cs: undefined },
          images: [],
          responsiveImages: [],
        }),
      ),
    ).toEqual(['@type', 'name', 'inLanguage', 'url']);
  });

  test('credits the studio, the team and the collaborators, with the award and status, in Czech', () => {
    expect(
      creativeWork({
        site,
        url: 'https://example.cz/projects/galerie/',
        owner,
        project: {
          ...project,
          realization: 'construction',
          team: ['Jan Novák', 'Jana Nováková', 'Eva Dvořáková'],
          collaborators: [
            { name: 'Ing. Petr Malý', role_cs: 'vizualizace', role_en: 'Visualizations' },
            { name: 'Ing. Iva Tichá', role_en: 'Statics' },
          ],
          award_cs: 'Odměna',
        },
        images: [],
        responsiveImages: [],
      }),
    ).toMatchObject({
      // The architect is one of the team, and named once.
      creator: [
        { '@type': 'Person', name: 'Jan Novák' },
        { '@id': 'https://example.cz/#person' },
        { '@type': 'Person', name: 'Eva Dvořáková' },
      ],
      contributor: [
        {
          '@type': 'Role',
          roleName: 'vizualizace',
          contributor: { '@type': 'Person', name: 'Ing. Petr Malý' },
        },
        { '@type': 'Person', name: 'Ing. Iva Tichá' },
      ],
      award: 'Odměna',
      creativeWorkStatus: 'Ve výstavbě',
    });
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


test('personal involvement does not establish project authorship or creation date', () => {
  const project = { title_cs: 'Projekt', from: '2024', to: '2025', brief_cs: 'Dokumentace pro povolení.', studio: 'Ateliér A', team: ['Jan Novák'], collaborators: [] };
  const node = creativeWork({ site, url: 'https://example.cz/project/', owner: owner.name,
    project,
    images: [], responsiveImages: [] });
  expect(node).not.toHaveProperty('dateCreated');
  expect(node.creator).toEqual([{ '@type': 'Person', name: 'Jan Novák' }]);
  expect(node.contributor).toContainEqual({ '@id': 'https://example.cz/#person' });
});


test('a design-team owner with surrounding whitespace is credited once', () => {
  const node = creativeWork({
    site, url: 'https://example.cz/project/', owner: owner.name,
    project: { title_cs: 'Projekt', brief_cs: 'Návrh.', team: [`  ${owner.name}  `], collaborators: [] },
    images: [], responsiveImages: [],
  });
  expect(node.creator).toEqual([{ '@id': 'https://example.cz/#person' }]);
  expect(node).not.toHaveProperty('contributor');
});

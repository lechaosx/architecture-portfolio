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
const emptyAbout = { services: [], awards: [] };
const contact = { email: 'jana@example.cz', location_cs: 'Brno' };

describe('person', () => {
  test('describes the architect from the content, in Czech', () => {
    const about = {
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
    };
    expect(
      person({
        site,
        owner,
        about,
        contact: { ...contact, phone: '+420 777 000 000' },
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
      makesOffer: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Rodinné domy' } },
      ],
      award: ['Cena Bohuslava Fuchse, 2. místo (2025)', 'Soutěž, Finále (9/2025–dosud)'],
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
      contact,
    });
    expect(Object.keys(node)).toEqual(['@type', '@id', 'name', 'jobTitle', 'url', 'email']);
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
    collaborators: [],
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
      contentLocation: { '@type': 'Place', name: 'Brno' },
      description: 'Anotace.',
      inLanguage: 'cs',
      url: 'https://example.cz/projects/galerie/',
      contributor: [{ '@id': 'https://example.cz/#person' }],
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

  test('puts an explicitly selected image first, keeps its caption and omits duplicate cover occurrences', () => {
    const { image } = creativeWork({
      site, url: 'https://example.cz/project/',
      project: { ...project, thumbnail: '/uploads/selected.png' },
      images: [
        { image: '/uploads/first.png', title_cs: 'První' },
        { image: '/uploads/selected.png', title_cs: 'Pohled', description_cs: 'Popis' },
        { image: '/uploads/selected.png', title_cs: 'Podruhé' },
        { image: '/uploads/untitled.png' },
      ],
      responsiveImages: [drawing('first'), drawing('selected'), drawing('selected'), drawing('untitled')],
      responsiveCover: drawing('selected'),
    });
    expect(image).toEqual([
      { '@type': 'ImageObject', contentUrl: 'https://example.cz/_responsive/selected/2560.webp', name: 'Pohled', caption: 'Popis' },
      { '@type': 'ImageObject', contentUrl: 'https://example.cz/_responsive/first/2560.webp', name: 'První' },
    ]);
  });

  test('includes an untitled standalone thumbnail even on a text-only page', () => {
    const { image } = creativeWork({
      site, url: 'https://example.cz/project/',
      project: { ...project, thumbnail: '/uploads/standalone.png' },
      images: [], responsiveImages: [], responsiveCover: drawing('standalone'),
    });
    expect(image).toEqual([
      { '@type': 'ImageObject', contentUrl: 'https://example.cz/_responsive/standalone/2560.webp' },
    ]);
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

  test('leaves out what the project leaves empty, and the date it was finished while it is ongoing', () => {
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
    ).toEqual(['@type', 'name', 'inLanguage', 'url', 'contributor']);
  });

  test('credits the architect and collaborators with supplied roles', () => {
    expect(
      creativeWork({
        site,
        url: 'https://example.cz/projects/galerie/',
        project: {
          ...project,
          realization: 'construction',
          collaborators: [
            { name: 'Jan Novák', role_cs: 'Autor návrhu · koordinace', role_en: 'Design author · Coordination' },
            { name: 'Eva Dvořáková', role_cs: 'Autor návrhu', role_en: 'Design author' },
            { name: 'Ing. Petr Malý', role_cs: 'vizualizace', role_en: 'Visualizations' },
            { name: 'Ing. Iva Tichá', role_en: 'Statics' },
          ],
          award_cs: 'Odměna',
        },
        images: [],
        responsiveImages: [],
      }),
    ).toMatchObject({
      contributor: [
        { '@id': 'https://example.cz/#person' },
        { '@type': 'Role', roleName: 'Autor návrhu · koordinace', contributor: { '@type': 'Person', name: 'Jan Novák' } },
        { '@type': 'Role', roleName: 'Autor návrhu', contributor: { '@type': 'Person', name: 'Eva Dvořáková' } },
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

  test('attaches a supplied personal role to the implicit architect without inferring authorship', () => {
    const node = creativeWork({
      site, url: 'https://example.cz/project/',
      project: { ...project, role_cs: '  Návrh, dokumentace  ' },
      images: [], responsiveImages: [],
    });
    expect(node.contributor).toEqual([{
      '@type': 'Role', roleName: 'Návrh, dokumentace',
      contributor: { '@id': 'https://example.cz/#person' },
    }]);
    expect(node).not.toHaveProperty('creator');
  });

  test('a blank personal role preserves the implicit architect credit', () => {
    const node = creativeWork({
      site, url: 'https://example.cz/project/',
      project: { ...project, role_cs: ' \n ' },
      images: [], responsiveImages: [],
    });
    expect(node.contributor).toEqual([{ '@id': 'https://example.cz/#person' }]);
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
  const project = { title_cs: 'Projekt', from: '2024', to: '2025', brief_cs: 'Dokumentace pro povolení.', studio: 'Ateliér A', collaborators: [{ name: 'Jan Novák', role_cs: 'Autor návrhu', role_en: 'Design author' }] };
  const node = creativeWork({ site, url: 'https://example.cz/project/',
    project,
    images: [], responsiveImages: [] });
  expect(node).not.toHaveProperty('dateCreated');
  expect(node.contributor).toEqual([{ '@id': 'https://example.cz/#person' }, { '@type': 'Role', roleName: 'Autor návrhu', contributor: { '@type': 'Person', name: 'Jan Novák' } }]);
  expect(node).not.toHaveProperty('creator');
});


test('credits the architect implicitly and trims supplied collaborator names and roles', () => {
  const node = creativeWork({
    site, url: 'https://example.cz/project/',
    project: { title_cs: 'Projekt', collaborators: [
      { name: '  Jan Novák  ', role_cs: '  dokumentace  ', role_en: 'Documentation' },
      { name: 'Petr' },
    ] },
    images: [], responsiveImages: [],
  });
  expect(node).not.toHaveProperty('creator');
  expect(node.contributor).toEqual([
    { '@id': 'https://example.cz/#person' },
    { '@type': 'Role', roleName: 'dokumentace', contributor: { '@type': 'Person', name: 'Jan Novák' } },
    { '@type': 'Person', name: 'Petr' },
  ]);
});

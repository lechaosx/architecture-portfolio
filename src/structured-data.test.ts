import { describe, expect, test } from 'vitest';
import {
  collectionPage,
  creativeWork,
  jsonLd,
  person,
  profilePage,
  webSite,
} from './structured-data';
import type { ResponsiveImage } from './images';

const site = new URL('https://example.cz/');
const owner = {
  name: 'Jana Nováková',
  credential: 'Ing. arch.',
  description: { cs: 'Portfolio architektky.', en: 'An architect’s portfolio.' },
};
const emptyAbout = { experience: [], services: [], education: [], awards: [] };
const emptyCv = { links: [] };
const contact = { email: 'jana@example.cz' };
const skill = (cs: string, en: string) => ({ name: { cs, en } });

describe('person', () => {
  test('describes the architect from the content, in Czech', () => {
    const about = {
      experience: [
        { place: { cs: 'Ateliér A', en: 'Studio A' }, title: { cs: 'Architektka', en: 'Architect' }, skills: [skill('Archicad', 'Archicad'), skill('Vizualizace', 'Visualisation')] },
        { place: { cs: 'Ateliér B', en: 'Studio B' }, title: { cs: 'Stážistka', en: 'Intern' }, skills: [skill('Revit', 'Revit'), skill('Archicad', 'Archicad')] },
        { place: { cs: 'Ateliér C', en: 'Studio C' }, title: { cs: 'Stážistka', en: 'Intern' }, skills: [] },
      ],
      services: [{ name: { cs: 'Rodinné domy', en: 'Family houses' } }],
      education: [
        {
          place: { cs: 'Fakulta stavební VUT v Brně', en: 'Faculty of Civil Engineering, BUT' },
          department: { cs: 'Ústav architektury', en: 'Institute of Architecture' },
          from: '2024',
          to: '2026',
          title: { cs: 'Architektura a rozvoj sídel', en: 'Architecture and Urban Development' },
          degree: 'Ing. arch.',
        },
        { place: { cs: 'SPŠ stavební', en: 'Building school' }, title: { cs: 'Maturita', en: 'School-leaving exam' }, degree: ' ' },
        { place: { cs: 'Fakulta stavební VUT v Brně', en: 'Faculty of Civil Engineering, BUT' }, title: { cs: 'Bc.', en: 'Bc.' } },
        { place: { cs: 'Probíhající studium', en: 'Ongoing study' }, from: '2025', title: { cs: 'Ph.D.', en: 'Ph.D.' }, degree: 'Ph.D.' },
      ],
      awards: [
        { place: { cs: 'Cena Bohuslava Fuchse', en: 'Bohuslav Fuchs Award' }, from: '2025', to: '2025', title: { cs: '2. místo', en: '2nd place' } },
        { place: { cs: 'Soutěž', en: 'Competition' }, from: '9/2025', title: { cs: 'Finále', en: 'Final' } },
      ],
    };
    expect(
      person({
        site,
        owner,
        about,
        cv: { links: [{ label: 'linkedin.com/in/jana', url: 'https://www.linkedin.com/in/jana' }, { label: 'Instagram', url: 'https://instagram.com/jana' }] },
        contact: { ...contact, phone: '+420 777 000 000', ico: '12345678', location: { cs: 'Brno', en: 'Brno' } },
        portrait: '/_responsive/hash/1280.webp',
      }),
    ).toEqual({
      '@type': 'Person',
      '@id': 'https://example.cz/#person',
      name: 'Jana Nováková',
      honorificPrefix: 'Ing. arch.',
      jobTitle: 'Architektka',
      description: 'Portfolio architektky.',
      url: 'https://example.cz/cs/',
      email: 'jana@example.cz',
      telephone: '+420 777 000 000',
      identifier: { '@type': 'PropertyValue', propertyID: 'IČO', value: '12345678' },
      image: 'https://example.cz/_responsive/hash/1280.webp',
      workLocation: { '@type': 'Place', name: 'Brno' },
      alumniOf: [
        { '@type': 'EducationalOrganization', name: 'Fakulta stavební VUT v Brně' },
        { '@type': 'EducationalOrganization', name: 'SPŠ stavební' },
      ],
      hasCredential: [
        {
          '@type': 'EducationalOccupationalCredential',
          name: 'Ing. arch.',
          credentialCategory: 'degree',
          recognizedBy: { '@type': 'EducationalOrganization', name: 'Fakulta stavební VUT v Brně' },
        },
      ],
      knowsAbout: ['Archicad', 'Vizualizace', 'Revit'],
      makesOffer: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Rodinné domy' } },
      ],
      award: ['Cena Bohuslava Fuchse, 2. místo (2025)', 'Soutěž, Finále (9/2025–dosud)'],
      sameAs: ['https://www.linkedin.com/in/jana', 'https://instagram.com/jana'],
    });
  });

  test('leaves out what the content leaves empty', () => {
    const node = person({
      site,
      owner: { name: owner.name, description: owner.description },
      about: emptyAbout,
      cv: emptyCv,
      contact,
    });
    expect(Object.keys(node)).toEqual(['@type', '@id', 'name', 'jobTitle', 'description', 'url', 'email']);
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
    title: { cs: 'Galerie', en: 'Gallery' },
    from: '2023',
    to: '6/2024',
    location: { cs: 'Brno', en: 'Brno' },
    role: [], collaborators: [],
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
          { image: '/uploads/Půdorys 1.svg', title: { cs: 'Půdorys', en: 'Plan' } },
          { image: '/uploads/untitled.png' },
          { image: '/uploads/rez.png', description: { cs: 'Popis řezu.', en: 'A section.' } },
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
          name: 'Půdorys – Galerie, Brno',
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
        { image: '/uploads/first.png', title: { cs: 'První', en: 'First' } },
        { image: '/uploads/selected.png', title: { cs: 'Pohled', en: 'View' }, description: { cs: 'Popis', en: 'Description' } },
        { image: '/uploads/selected.png', title: { cs: 'Podruhé', en: 'Again' } },
        { image: '/uploads/untitled.png' },
      ],
      responsiveImages: [drawing('first'), drawing('selected'), drawing('selected'), drawing('untitled')],
      responsiveCover: drawing('selected'),
    });
    expect(image).toEqual([
      { '@type': 'ImageObject', contentUrl: 'https://example.cz/_responsive/selected/2560.webp', name: 'Pohled – Galerie, Brno', caption: 'Popis' },
      { '@type': 'ImageObject', contentUrl: 'https://example.cz/_responsive/first/2560.webp', name: 'První – Galerie, Brno' },
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
      images: [{ image: '/uploads/cover.png', title: { cs: 'Pohled', en: 'View' } }],
      responsiveImages: [drawing('cover')],
    });
    expect(image).toEqual([
      {
        '@type': 'ImageObject',
        contentUrl: 'https://example.cz/_responsive/cover/2560.webp',
        name: 'Pohled – Galerie, Brno',
      },
    ]);
  });

  test('leaves out what the project leaves empty, and the date it was finished while it is ongoing', () => {
    expect(
      Object.keys(
        creativeWork({
          site,
          url: 'https://example.cz/projects/galerie/',
          project: { ...project, location: undefined },
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
            { name: 'Jan Novák', role: { cs: 'Autor návrhu · koordinace', en: 'Design author · Coordination' } },
            { name: 'Eva Dvořáková', role: { cs: 'Autor návrhu', en: 'Design author' } },
            { name: 'Ing. Petr Malý', role: { cs: 'vizualizace', en: 'Visualizations' } },
            { name: 'Ing. Iva Tichá' },
          ],
          award: { cs: 'Odměna', en: 'Special mention' },
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

  test('attaches supplied personal roles to the implicit architect without inferring authorship', () => {
    const node = creativeWork({
      site, url: 'https://example.cz/project/',
      project: { ...project, role: [{ cs: '  Návrh  ', en: 'Design' }, { cs: 'Dokumentace', en: 'Documentation' }] },
      images: [], responsiveImages: [],
    });
    expect(node.contributor).toEqual([{
      '@type': 'Role', roleName: ['Návrh', 'Dokumentace'],
      contributor: { '@id': 'https://example.cz/#person' },
    }]);
    expect(node).not.toHaveProperty('creator');
  });
});

test('names the outside page about the project, unless the CMS left it empty', () => {
  const work = (project_url: string) => creativeWork({
    site, url: 'https://example.cz/project/',
    project: { title: { cs: 'Projekt', en: 'Project' }, role: [], collaborators: [], project_url },
    images: [], responsiveImages: [],
  });
  expect(work('https://example.org/news/library')).toMatchObject({
    subjectOf: { '@type': 'WebPage', url: 'https://example.org/news/library' },
  });
  expect(work('')).not.toHaveProperty('subjectOf');
});

test('the work page lists every project in page order, linking those with a page', () => {
  const project = {
    from: '2024', draft: false, context: [], intervention: [], scope: [],
    design_in_progress: false, role: [], collaborators: [], blocks: [],
  };
  const node = collectionPage({
    site, url: 'https://example.cz/en/work/', lang: 'en',
    projects: [
      { id: 'library', data: { ...project, title: { cs: 'Knihovna', en: 'Library' }, blocks: [{ type: 'text', body: { cs: 'Text.', en: 'Text.' } }] } },
      { id: 'competition', data: {
        ...project, title: { cs: 'Soutěž', en: 'Competition' },
        project_url: 'https://example.org/competition',
      } },
    ],
  });
  expect(node).toMatchObject({ '@type': 'CollectionPage', url: 'https://example.cz/en/work/' });
  const items = node.mainEntity.itemListElement;
  expect(items.map(({ position, item }) => [position, item.name, item.url])).toEqual([
    [1, 'Library', 'https://example.cz/en/projects/library/'],
    [2, 'Competition', undefined],
  ]);
  expect(items[1].item).toMatchObject({
    subjectOf: { '@type': 'WebPage', url: 'https://example.org/competition' },
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
  const project = { title: { cs: 'Projekt', en: 'Project' }, from: '2024', to: '2025', brief: { cs: 'Dokumentace pro povolení.', en: 'Permit documentation.' }, studio: 'Ateliér A', role: [], collaborators: [{ name: 'Jan Novák', role: { cs: 'Autor návrhu', en: 'Design author' } }] };
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
    project: { title: { cs: 'Projekt', en: 'Project' }, role: [], collaborators: [
      { name: '  Jan Novák  ', role: { cs: '  dokumentace  ', en: 'Documentation' } },
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

test('English person facts use English service names, award text and ongoing periods', () => {
  const node = person({
    site, owner, contact, cv: emptyCv, lang: 'en',
    about: {
      experience: [{ place: { cs: 'Ateliér', en: 'Studio' }, title: { cs: 'Architektka', en: 'Architect' }, skills: [skill('Vizualizace', 'Visualisation')] }],
      services: [{ name: { cs: 'Rodinné domy', en: 'Family houses' } }],
      education: [{ place: { cs: 'VUT v Brně', en: 'Brno University of Technology' }, title: { cs: 'Architektura', en: 'Architecture' } }],
      awards: [{ place: { cs: 'Soutěž', en: 'Competition' }, title: { cs: 'Finále', en: 'Final' }, from: '9/2025' }],
    },
  });
  expect(node).toMatchObject({
    '@id': 'https://example.cz/#person', jobTitle: 'Architect', url: 'https://example.cz/en/',
    description: 'An architect’s portfolio.',
    alumniOf: [{ '@type': 'EducationalOrganization', name: 'Brno University of Technology' }],
    knowsAbout: ['Visualisation'],
    makesOffer: [{ '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Family houses' } }],
    award: ['Competition, Final (9/2025–present)'],
  });
});

import { expect, test } from 'vitest';
import { llmsTxt } from './llms-txt';

const site = new URL('https://example.cz/');
const name = 'Ing. arch. Jana Nováková';
const about = {
  body_cs: 'Jsem **architektka**.',
  body_en: 'I am an **architect**.',
  experience: [],
  services: [],
  education: [],
  awards: [],
};
const contact = { email: 'jana@example.cz' };
const project = {
  title_cs: 'Galerie',
  title_en: 'Gallery',
  year: 2024,
  draft: false,
  blocks: [],
};

test('presents the architect and her projects, Czech first', () => {
  expect(
    llmsTxt({
      site,
      name,
      description: { cs: 'Portfolio architektky.', en: 'An architect’s portfolio.' },
      about: {
        ...about,
        experience: [
          {
            place_cs: 'Ateliér A, Brno',
            place_en: 'Studio A, Brno',
            years: '2024–dosud',
            title_cs: 'Architektka',
            title_en: 'Architect',
            description_cs: 'Rodinné domy.\nInteriéry.',
            description_en: 'Family houses.\n\nInteriors.',
            tags: [
              { name_cs: 'BIM', name_en: 'BIM' },
              { name_cs: 'Studie', name_en: 'Studies' },
            ],
          },
          { place_cs: 'Ateliér B', place_en: 'Studio B', title_cs: 'Stáž', title_en: 'Internship', tags: [] },
        ],
        services: [
          { name_cs: 'Rodinné domy', name_en: 'Family houses' },
          { name_cs: 'Interiéry', name_en: 'Interiors' },
        ],
        education: [
          {
            place_cs: 'Fakulta stavební VUT v Brně',
            place_en: 'Faculty of Civil Engineering, BUT',
            department_cs: 'Ústav architektury',
            department_en: 'Institute of Architecture',
            years: '2020–2024',
            title_cs: 'Architektura pozemních staveb',
            title_en: 'Building Architecture',
            tags: [],
          },
        ],
        awards: [{ place_cs: 'Soutěž', place_en: 'Competition', years: '2025', title_cs: '1. místo', title_en: '1st place', tags: [] }],
      },
      contact: { ...contact, phone: '+420 777 000 000', location_cs: 'Brno', location_en: 'Brno' },
      projects: [
        {
          id: 'galerie',
          data: {
            ...project,
            location_cs: 'Brno, Česko',
            location_en: 'Brno, Czechia',
            brief_cs: 'Anotace.',
            brief_en: 'Brief.',
            blocks: [
              { type: 'text', body_cs: 'Text projektu.', body_en: 'Project text.' },
              {
                type: 'gallery',
                images: [
                  { image: '/uploads/a.png', title_cs: 'Půdorys', title_en: 'Plan' },
                  { image: '/uploads/b.png' },
                  { image: '/uploads/c.png', description_cs: 'Popis.', description_en: 'Description.' },
                ],
              },
            ],
          },
        },
      ],
    }),
  ).toBe(`# Ing. arch. Jana Nováková

> Portfolio architektky.
>
> An architect’s portfolio.

## O mně / About

Jsem **architektka**.

I am an **architect**.

## Praxe / Experience

- 2024–dosud · Architektka – Ateliér A, Brno / Architect – Studio A, Brno
  Rodinné domy.
  Interiéry.
  Family houses.
  Interiors.
  BIM, Studie / BIM, Studies
- Stáž – Ateliér B / Internship – Studio B

## Služby / Services

- Rodinné domy / Family houses
- Interiéry / Interiors

## Vzdělání / Education

- 2020–2024 · Architektura pozemních staveb – Fakulta stavební VUT v Brně, Ústav architektury / Building Architecture – Faculty of Civil Engineering, BUT, Institute of Architecture

## Ocenění / Awards

- 2025 · 1. místo – Soutěž / 1st place – Competition

## Kontakt / Contact

- E-mail / Email: jana@example.cz
- Telefon / Phone: +420 777 000 000
- Místo / Location: Brno

## Práce / Work

### Galerie / Gallery

Brno, Česko / Brno, Czechia · 2024

https://example.cz/projects/galerie/

Anotace.

Brief.

Text projektu.

Project text.

#### Půdorys / Plan

#### Obrázek 3 / Image 3

Popis.

Description.
`);
});

test('leaves out empty sections', () => {
  expect(llmsTxt({ site, name, description: {}, about, contact, projects: [] })).toBe(`# Ing. arch. Jana Nováková

## O mně / About

Jsem **architektka**.

I am an **architect**.

## Kontakt / Contact

- E-mail / Email: jana@example.cz
`);
});

test('lists projects newest first, linking only those with a page', () => {
  const output = llmsTxt({
    site,
    name,
    description: {},
    about,
    contact,
    projects: [
      { id: 'old', data: { ...project, title_cs: 'Starý', title_en: 'Old', year: 2020 } },
      {
        id: 'new',
        data: {
          ...project,
          title_cs: 'Nový',
          title_en: 'New',
          year: 2025,
          blocks: [{ type: 'text', body_cs: 'Text.', body_en: 'Text.' }],
        },
      },
    ],
  });
  expect(output.indexOf('### Nový / New')).toBeLessThan(output.indexOf('### Starý / Old'));
  expect(output).toContain('https://example.cz/projects/new/');
  expect(output).not.toContain('/projects/old/');
});

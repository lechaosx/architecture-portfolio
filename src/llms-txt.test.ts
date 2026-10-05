import { expect, test } from 'vitest';
import { llmsTxt } from './llms-txt';

const site = new URL('https://example.cz/');
const name = 'Ing. arch. Jana Nováková';
const home = {
  body_cs: 'Jsem **architektka**.',
  body_en: 'I am an **architect**.',
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
      home: {
        ...home,
        services: [
          { name_cs: 'Rodinné domy', name_en: 'Family houses' },
          { name_cs: 'Interiéry', name_en: 'Interiors' },
        ],
        area_cs: 'Brno a okolí',
        area_en: 'Brno and around',
        education: [{ text_cs: 'FA VUT Brno', text_en: 'FA BUT Brno' }],
        awards: [{ text_cs: 'Cena, 2025', text_en: 'Award, 2025' }],
      },
      contact: { ...contact, phone: '+420 777 000 000' },
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

## Služby / Services

- Rodinné domy / Family houses
- Interiéry / Interiors

## Kde pracuji / Where I work

Brno a okolí / Brno and around

## Vzdělání / Education

- FA VUT Brno / FA BUT Brno

## Ocenění / Awards

- Cena, 2025 / Award, 2025

## Kontakt / Contact

- E-mail / Email: jana@example.cz
- Telefon / Phone: +420 777 000 000

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
  expect(llmsTxt({ site, name, description: {}, home, contact, projects: [] })).toBe(`# Ing. arch. Jana Nováková

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
    home,
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

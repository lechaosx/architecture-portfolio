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
  from: '2024',
  to: '2024',
  draft: false,
  context: [], intervention: [], scope: [], design_in_progress: false, collaborators: [],
  blocks: [],
};

test('exports the full external project URL with its bilingual label', () => {
  const project_url = 'https://example.org/projects/library?view=plan#drawings';
  const output = llmsTxt({
    site, name, about, contact, description: {},
    projects: [{ id: 'library', data: { ...project, project_url } }],
  });
  expect(output).toContain(`Odkaz na projekt / Project website: ${project_url}`);
});

test('exports a personal role separately from the brief and collaborator roles', () => {
  const output = llmsTxt({
    site, name, about, contact, description: {},
    projects: [{ id: 'library', data: {
      ...project,
      brief_cs: 'Knihovna s veřejnou zahradou. Navrhla jsem její interiér.',
      brief_en: 'A library with a public garden. I designed its interior.',
      role_cs: 'Návrh interiéru', role_en: 'Interior design',
      collaborators: [{ name: 'Jan Novák', role_cs: 'Statika', role_en: 'Structural design' }],
    } }],
  });
  expect(output).toContain('Moje role / My role: Návrh interiéru / Interior design');
  expect(output).toContain('Spolupráce / Collaborators: Jan Novák – Statika / Structural design');
  expect(output).toContain('Knihovna s veřejnou zahradou. Navrhla jsem její interiér.');
  expect(output).toContain('A library with a public garden. I designed its interior.');
});

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
            from: '3/2024',
            title_cs: 'Architektka',
            title_en: 'Architect',
            description_cs: 'Rodinné domy.\nInteriéry.',
            description_en: 'Family houses.\n\nInteriors.',
          },
          { place_cs: 'Ateliér B', place_en: 'Studio B', title_cs: 'Stáž', title_en: 'Internship' },
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
            from: '2020',
            to: '2024',
            title_cs: 'Architektura pozemních staveb',
            title_en: 'Building Architecture',
          },
        ],
        awards: [{ place_cs: 'Soutěž', place_en: 'Competition', from: '2025', to: '2025', title_cs: '1. místo', title_en: '1st place' }],
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
            realization: 'built',
            studio: 'Ateliér A',
            collaborators: [
              { name: 'Jan Novák', role_cs: 'Autor návrhu', role_en: 'Design author' },
              { name: 'Eva Dvořáková', role_cs: 'Autor návrhu', role_en: 'Design author' },
              { name: 'Ing. Petr Malý', role_cs: 'vizualizace', role_en: 'Visualizations' },
              { name: 'Ing. Iva Tichá' },
            ],
            award_cs: 'Odměna',
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

- 3/2024–dosud / 3/2024–present · Architektka – Ateliér A, Brno / Architect – Studio A, Brno
  Rodinné domy.
  Interiéry.
  Family houses.
  Interiors.
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

Brno, Česko / Brno, Czechia · Moje zapojení / My involvement: 2024

https://example.cz/projects/galerie/

- Informace o projektu / Project information: Realizováno / Built

- Ateliér / Studio: Ateliér A
- Spolupráce / Collaborators: Jan Novák – Autor návrhu / Design author; Eva Dvořáková – Autor návrhu / Design author; Ing. Petr Malý – vizualizace / Visualizations; Ing. Iva Tichá
- Ocenění / Award: Odměna

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
      { id: 'old', data: { ...project, title_cs: 'Starý', title_en: 'Old', from: '2020', to: '2020' } },
      {
        id: 'new',
        data: {
          ...project,
          title_cs: 'Nový',
          title_en: 'New',
          from: '2025',
          to: '2025',
          blocks: [{ type: 'text', body_cs: 'Text.', body_en: 'Text.' }],
        },
      },
    ],
  });
  expect(output.indexOf('### Nový / New')).toBeLessThan(output.indexOf('### Starý / Old'));
  expect(output).toContain('https://example.cz/projects/new/');
  expect(output).not.toContain('/projects/old/');
});

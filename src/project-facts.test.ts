import { expect, test } from 'vitest';
import { projectBadges, projectFacts } from './project-facts';

const project = {
  from: '2024',
  to: '2024',
  location_cs: 'Brno',
  location_en: 'Brno',
  collaborators: [],
  context: [],
  intervention: [],
  scope: [],
  design_in_progress: false,
};

test('lists the filled credits, award and status in sheet order, names kept as items', () => {
  expect(
    projectFacts({
      ...project,
      studio: 'Ateliér A | Ing. arch. Jan Novák',
      collaborators: [
        { name: 'Jan Novák', role_cs: 'Autor návrhu', role_en: 'Design author' },
        { name: 'Eva Dvořáková', role_cs: 'Autor návrhu · koordinace', role_en: 'Design author · Coordination' },
        { name: 'Ing. Petr Malý', role_cs: 'vizualizace', role_en: 'Visualizations' },
        { name: 'Ing. Pavel Velký', role_cs: 'statika' },
        { name: 'Ing. Iva Tichá' },
      ],
      award_cs: 'Odměna',
      award_en: 'Special mention',
    }),
  ).toEqual([
    {
      label: 'studio',
      lines: [{ names: [], cs: 'Ateliér A | Ing. arch. Jan Novák', en: 'Ateliér A | Ing. arch. Jan Novák' }],
    },
    {
      label: 'collaborators',
      lines: [
        { names: ['Jan Novák'], cs: 'Autor návrhu', en: 'Design author' },
        { names: ['Eva Dvořáková'], cs: 'Autor návrhu · koordinace', en: 'Design author · Coordination' },
        { names: ['Ing. Petr Malý'], cs: 'vizualizace', en: 'Visualizations' },
        { names: ['Ing. Pavel Velký'], cs: 'statika', en: '' },
        { names: ['Ing. Iva Tichá'], cs: '', en: '' },
      ],
    },
    { label: 'award', lines: [{ names: [], cs: 'Odměna', en: 'Special mention' }] },
  ]);
});

test('leads with the place and period where asked', () => {
  expect(projectFacts({ ...project, location_en: undefined, to: undefined }, { placeAndPeriod: true })).toEqual([
    { label: 'location', lang: 'cs', lines: [{ names: [], cs: 'Brno', en: '' }] },
    { label: 'involvement', lines: [{ names: [], cs: '2024–dosud', en: '2024–present' }] },
  ]);
});

test('a text filled in one language shows only in that language', () => {
  expect(projectFacts({ ...project, award_en: 'Special mention' })).toEqual([
    { label: 'award', lang: 'en', lines: [{ names: [], cs: '', en: 'Special mention' }] },
  ]);
});

test('has no rows when nothing is filled', () => {
  expect(projectFacts(project)).toEqual([]);
});

test('keeps my role separate from the studio and other contributors’ roles', () => {
  expect(projectFacts({
    ...project,
    studio: 'Ateliér A',
    role_cs: 'Návrh, dokumentace', role_en: 'Design, documentation',
    collaborators: [{ name: 'Jan Novák', role_cs: 'Statika', role_en: 'Structural design' }],
  })).toEqual([
    { label: 'studio', lines: [{ names: [], cs: 'Ateliér A', en: 'Ateliér A' }] },
    { label: 'myRole', lines: [{ names: [], cs: 'Návrh, dokumentace', en: 'Design, documentation' }] },
    { label: 'collaborators', lines: [{ names: ['Jan Novák'], cs: 'Statika', en: 'Structural design' }] },
  ]);
});

test('an empty or whitespace-only personal role adds no fact row', () => {
  for (const role of [undefined, '', ' \n\t ']) {
    expect(projectFacts({ ...project, role_cs: role, role_en: role })).toEqual([]);
  }
});

test('a project website keeps the complete target and displays its hostname', () => {
  const project_url = 'https://example.org/projects/library?view=plan#drawings';
  expect(projectFacts({ ...project, project_url })).toEqual([{
    label: 'projectWebsite',
    href: project_url,
    lines: [{ names: [], cs: 'example.org', en: 'example.org' }],
  }]);
  expect(projectFacts({ ...project, project_url: '' })).toEqual([]);
});

test('title badges include only supplied context and independent progress', () => {
  expect(projectBadges(project)).toEqual([]);
  expect(projectBadges({ ...project, context: ['academic', 'competition'], design_in_progress: true, realization: 'planned' })).toEqual(['academic', 'competition', 'design_in_progress', 'planned']);
});

test('intervention and scope are badges in the fact sheet, separate from progress', () => {
  expect(projectFacts({ ...project, intervention: ['renovation', 'extension'], scope: ['architecture', 'interior'] })).toEqual([
    { label: 'intervention', lines: [], badges: ['renovation', 'extension'] },
    { label: 'scope', lines: [], badges: ['architecture', 'interior'] },
  ]);
});

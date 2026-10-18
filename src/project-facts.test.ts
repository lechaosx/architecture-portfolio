import { expect, test } from 'vitest';
import { projectBadges, projectFacts } from './project-facts';

const project = {
  from: '2024',
  to: '2024',
  location_cs: 'Brno',
  location_en: 'Brno',
  team: [],
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
      team: ['Jan Novák', 'Eva Dvořáková'],
      collaborators: [
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
      label: 'projectTeam',
      lines: [
        { label: 'team', names: ['Jan Novák', 'Eva Dvořáková'], cs: '', en: '' },
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

import { expect, test } from 'vitest';
import { projectCover, workProjects, type Project } from './projects';

const project = (id: string, year: number): Project => ({
  id,
  data: { title_cs: id, title_en: id, from: String(year), to: String(year), draft: false, context: [], intervention: [], scope: [], design_in_progress: false, collaborators: [], blocks: [] },
});

test('projects list ongoing first, then latest first, then by English title', () => {
  const { listed } = workProjects([
    project('b', 2024),
    project('old', 2020),
    project('a', 2024),
    { id: 'ongoing', data: { ...project('ongoing', 2019).data, to: undefined } },
  ]);
  expect(listed.map(({ id }) => id)).toEqual(['ongoing', 'a', 'b', 'old']);
});

const first = { image: '/uploads/first.jpg' };
const selected = { image: '/uploads/selected.jpg', title_cs: 'Pohled', title_en: 'View', description_cs: 'Popis', description_en: 'Description' };

test('an explicit thumbnail keeps the matching page image metadata', () => {
  expect(projectCover(selected.image, [first, selected])).toBe(selected);
});

test('a thumbnail can be independent of the page images', () => {
  expect(projectCover('/uploads/standalone.jpg', [first])).toEqual({ image: '/uploads/standalone.jpg' });
});

test.each([undefined, '', '  \n '])('an unset thumbnail falls back to the first page image: %s', (thumbnail) => {
  expect(projectCover(thumbnail, [first, selected])).toBe(first);
  expect(projectCover(thumbnail, [])).toBeUndefined();
});

test('cards use the selected thumbnail without changing page image order', () => {
  const data = { ...project('selected', 2026).data, thumbnail: selected.image, blocks: [
    { type: 'gallery' as const, images: [first, selected] },
  ] };
  const { grid } = workProjects([{ id: 'selected', data }]);
  expect(grid[0].cover).toBe(selected);
  expect(grid[0].data.blocks).toBe(data.blocks);
});

test('a thumbnail makes a text-only page a card but leaves a project with no blocks in the index', () => {
  const empty = { ...project('empty', 2026), data: { ...project('empty', 2026).data, thumbnail: '/uploads/standalone.jpg' } };
  const text = { ...project('text', 2026), data: { ...project('text', 2026).data, thumbnail: '/uploads/standalone.jpg', blocks: [
    { type: 'text' as const, body_cs: 'Text', body_en: 'Text' },
  ] } };
  const { grid, listed } = workProjects([empty, text]);
  expect(grid.map(({ id }) => id)).toEqual(['text']);
  expect(grid[0].cover.image).toBe('/uploads/standalone.jpg');
  expect(listed.map(({ id }) => id)).toEqual(['empty']);
});

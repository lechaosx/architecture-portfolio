import { expect, test } from 'vitest';
import { chosenCards, projectCover, publishedProjects, withoutMissingImages, workProjects, type Project } from './projects';

const project = (id: string, year: number): Project => ({
  id,
  data: { title: { cs: id, en: id }, from: String(year), to: String(year), draft: false, context: [], intervention: [], scope: [], design_in_progress: false, collaborators: [], blocks: [] },
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
const selected = { image: '/uploads/selected.jpg', title: { cs: 'Pohled', en: 'View' }, description: { cs: 'Popis', en: 'Description' } };

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
    { type: 'text' as const, body: { cs: 'Text', en: 'Text' } },
  ] } };
  const { grid, listed } = workProjects([empty, text]);
  expect(grid.map(({ id }) => id)).toEqual(['text']);
  expect(grid[0].cover.image).toBe('/uploads/standalone.jpg');
  expect(listed.map(({ id }) => id)).toEqual(['empty']);
});

test('images whose file is missing are left out, each looked up by its field, with any image block they empty', () => {
  const missing = { image: '/uploads/deleted.jpg' };
  const text = { type: 'text' as const, body: { cs: 'Text', en: 'Text' } };
  const data = { ...project('missing', 2026).data, thumbnail: missing.image, blocks: [
    { type: 'image_set' as const, images: [missing] },
    text,
    { type: 'gallery' as const, images: [first, missing, selected] },
  ] };
  const reported: string[] = [];
  const found = (path: string, field: string) => {
    if (path === missing.image) reported.push(field);
    return path !== missing.image;
  };
  expect(withoutMissingImages(data, found)).toEqual({
    ...data,
    thumbnail: undefined,
    blocks: [text, { type: 'gallery', images: [first, selected] }],
  });
  expect(reported).toEqual(['thumbnail', 'blocks[0].images[0].image', 'blocks[2].images[1].image']);
});

test('the published projects leave out drafts, and report a missing image at its file and field', () => {
  const shown = { ...project('shown', 2026), filePath: 'src/content/projects/shown.md' };
  const draft = { ...project('draft', 2026), filePath: 'src/content/projects/draft.md' };
  shown.data = { ...shown.data, thumbnail: '/uploads/deleted.jpg' };
  draft.data = { ...draft.data, draft: true };
  const reported: string[] = [];
  const found = (_path: string, location: string) => {
    reported.push(location);
    return false;
  };
  expect(publishedProjects([draft, shown], found)).toEqual([{ ...shown, data: { ...shown.data, thumbnail: undefined } }]);
  expect(reported).toEqual(['src/content/projects/shown.md: thumbnail']);
});

test('the chosen projects become cards in the chosen order, leaving out and reporting any without a card', () => {
  const card = (id: string, year: number) => ({
    ...project(id, year),
    filePath: `src/content/projects/${id}.md`,
    data: { ...project(id, year).data, blocks: [{ type: 'image_set' as const, images: [first] }] },
  });
  const textOnly = {
    ...project('text', 2026),
    filePath: 'src/content/projects/text.md',
    data: { ...project('text', 2026).data, blocks: [{ type: 'text' as const, body: { cs: 'Text', en: 'Text' } }] },
  };
  const { cards, issues } = chosenCards(
    [
      'src/content/projects/old.md',
      'src/content/projects/draft.md',
      'src/content/projects/new.md',
      'src/content/projects/text.md',
      'src/content/projects/old.md',
    ],
    [card('new', 2026), textOnly, card('old', 2020)],
  );
  expect(cards.map(({ id, cover }) => [id, cover])).toEqual([['old', first], ['new', first]]);
  expect(issues.map(({ index }) => index)).toEqual([1, 3, 4]);
});

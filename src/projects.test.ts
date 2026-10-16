import { expect, test } from 'vitest';
import { projectPages, workProjects, type Project } from './projects';

const image = { type: 'image_set' as const, images: [{ image: '/uploads/plan.png' }] };
const text = { type: 'text' as const, body_cs: 'Text.', body_en: 'Text.' };
const project = (id: string, year: number, blocks: Project['data']['blocks']): Project => ({
  id,
  data: { title_cs: id, title_en: id, from: String(year), to: String(year), draft: false, blocks },
});

test('projects list ongoing first, then latest first, then by English title', () => {
  const { listed } = workProjects([
    project('b', 2024, []),
    project('old', 2020, []),
    project('a', 2024, []),
    { id: 'ongoing', data: { ...project('ongoing', 2019, []).data, to: undefined } },
  ]);
  expect(listed.map(({ id }) => id)).toEqual(['ongoing', 'a', 'b', 'old']);
});

test('project pages follow the work page: its cards, then its index, each with its neighbours', () => {
  const pages = projectPages([
    project('text-new', 2026, [text]),
    project('image-old', 2020, [image]),
    project('brief', 2025, []),
    project('image-new', 2024, [text, image]),
  ]);
  expect(
    pages.map(({ project, previous, next }) => [previous?.id, project.id, next?.id]),
  ).toEqual([
    [undefined, 'image-new', 'image-old'],
    ['image-new', 'image-old', 'text-new'],
    ['image-old', 'text-new', undefined],
  ]);
});

import { expect, test } from 'vitest';
import { workProjects, type Project } from './projects';

const project = (id: string, year: number): Project => ({
  id,
  data: { title_cs: id, title_en: id, from: String(year), to: String(year), draft: false, context: [], intervention: [], scope: [], design_in_progress: false, team: [], blocks: [] },
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

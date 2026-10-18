import type { Project } from '../../src/projects';

export const thumbnailProjects: Project[] = ['later', 'standalone', 'text', 'empty', 'first'].map((kind) => ({
  id: `e2e-thumbnail-${kind}`,
  data: {
    title_cs: `Náhled ${kind}`, title_en: `Thumbnail ${kind}`,
    from: kind === 'later' ? '2027' : '2026', to: kind === 'later' ? '2027' : '2026', draft: false,
    context: [], intervention: [], scope: [], design_in_progress: false, collaborators: [],
    thumbnail: `/e2e/images/${kind === 'later' ? 'square-2.png' : kind === 'first' ? 'cover.png' : 'wide.png'}`,
    blocks: kind === 'empty' ? [] : kind === 'text'
      ? [{ type: 'text', body_cs: 'Textový projekt.', body_en: 'A text project.' }]
      : [
          { type: 'image_set', images: [{ image: '/e2e/images/cover.png' }] },
          { type: 'gallery', images: [{ image: '/e2e/images/square-2.png', title_cs: 'Pohled', title_en: 'View' }] },
        ],
  },
}));

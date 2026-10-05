import type { CollectionEntry } from 'astro:content';
import { marked } from 'marked';

type Project = CollectionEntry<'projects'>['data'];

// Search engines show about this much of a description.
const MAX_LENGTH = 160;

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function excerpt(markdown: string) {
  const text = oneLine(
    marked
      .parse(markdown, { async: false })
      // Line breaks part words; inline tags such as <strong> must not part
      // them from adjoining punctuation. Blocks end in a newline already.
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity]),
  );
  if (text.length <= MAX_LENGTH) return text || undefined;
  const space = text.lastIndexOf(' ', MAX_LENGTH - 1);
  return `${text.slice(0, space > 0 ? space : MAX_LENGTH - 1)}…`;
}

/**
 * A project's description in each language: its brief, else the start of its
 * first text block.
 */
export function projectDescription(
  project: Pick<Project, 'brief_cs' | 'brief_en' | 'blocks'>,
) {
  const text = project.blocks.find((block) => block.type === 'text');
  const describe = (brief?: string, body?: string) =>
    brief?.trim() ? oneLine(brief) : body ? excerpt(body) : undefined;
  return {
    cs: describe(project.brief_cs, text?.body_cs),
    en: describe(project.brief_en, text?.body_en),
  };
}

import type { CollectionEntry } from 'astro:content';
import { marked } from 'marked';
import type { Lang } from './i18n';

type Data = CollectionEntry<'projects'>['data'];

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

/** Text on one line, cut at a word boundary to what search engines show. */
function shorten(text: string) {
  const line = oneLine(text);
  if (line.length <= MAX_LENGTH) return line || undefined;
  const space = line.lastIndexOf(' ', MAX_LENGTH - 1);
  return `${line.slice(0, space > 0 ? space : MAX_LENGTH - 1)}…`;
}

/**
 * Items joined by commas: as many whole ones as fit what search engines show,
 * then an ellipsis. A first item too long to fit is shortened.
 */
export function shortList(items: string[]) {
  const all = items.map(oneLine).filter(Boolean);
  for (let count = all.length; count > 0; count -= 1) {
    const text = all.slice(0, count).join(', ') + (count < all.length ? '…' : '');
    if (text.length <= MAX_LENGTH) return text;
  }
  return all[0] && shorten(all[0]);
}

/** Markdown as plain text, shortened. */
export function excerpt(markdown: string) {
  return shorten(
    marked
      .parse(markdown, { async: false })
      // Line breaks part words; inline tags such as <strong> must not part
      // them from adjoining punctuation. Blocks end in a newline already.
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity]),
  );
}

/**
 * A project's description in each language: its brief, else the start of its
 * first text block.
 */
export function projectDescription(project: Pick<Data, 'brief' | 'blocks'>) {
  const text = project.blocks.find((block) => block.type === 'text');
  const describe = (lang: Lang) =>
    project.brief ? oneLine(project.brief[lang]) : text && excerpt(text.body[lang]);
  return { cs: describe('cs'), en: describe('en') };
}

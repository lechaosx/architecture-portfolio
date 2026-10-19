import { expect, test } from 'vitest';
import { Lexer, parseInline, type Tokens } from 'marked';
import * as llms from './llms-txt';

const site = new URL('https://example.cz/');
const name = 'Ing. arch. Jana Nováková';
const about = {
  body_cs: 'Jsem **architektka**.',
  body_en: 'I am an **architect**.',
  experience: [], services: [], education: [], awards: [],
};
const contact = { email: 'jana@example.cz' };
const project = {
  title_cs: 'Galerie', title_en: 'Gallery', from: '2024', to: '2024',
  draft: false, context: [], intervention: [], scope: [],
  design_in_progress: false, collaborators: [], blocks: [],
};
const input = { site, name, about, contact, description: {}, projects: [] };

function indexLinks(text: string) {
  const tokens = Lexer.lex(text);
  const sections = tokens.filter((token) => token.type !== 'space');
  const firstSection = sections.findIndex((token) => token.type === 'heading' && token.depth === 2);
  const links: Tokens.Link[] = [];
  for (const [position, token] of sections.slice(firstSection).entries()) {
    if (position % 2 === 0) {
      expect(token.type).toBe('heading');
      expect((token as Tokens.Heading).depth).toBe(2);
    } else {
      expect(token.type).toBe('list');
      for (const item of (token as Tokens.List).items) {
        const inline = Lexer.lexInline(item.text);
        expect(inline[0].type).toBe('link');
        expect(inline[1].raw).toMatch(/^: \S/);
        links.push(inline[0] as Tokens.Link);
      }
    }
  }
  return links;
}

test('llms.txt is a bilingual link index with a summary and shared-language URL guidance', () => {
  const output = llms.llmsTxt({
    ...input,
    description: { cs: 'Portfolio architektky.', en: 'An architect’s portfolio.' },
  });
  const tokens = Lexer.lex(output).filter((token) => token.type !== 'space');
  expect(tokens[0]).toMatchObject({ type: 'heading', depth: 1, text: name });
  expect(tokens[1]).toMatchObject({ type: 'blockquote' });
  expect(tokens[1].raw).toContain('Portfolio architektky.');
  expect(tokens[1].raw).toContain('An architect’s portfolio.');
  expect(tokens[2]).toMatchObject({ type: 'paragraph' });
  expect(tokens[2].raw).toContain('cs');
  expect(tokens[2].raw).toContain('en');
  expect(tokens[2].raw).toContain('stejné');
  expect(tokens[2].raw).toContain('same');
  expect(indexLinks(output).map((link) => link.href)).toEqual([
    'https://example.cz/about/', 'https://example.cz/work/', 'https://example.cz/llms-full.txt',
  ]);
  expect(output).toContain('O mně / About');
  expect(output).toContain('Práce / Work');
  expect(output).not.toContain(about.body_cs);
});

test('the index links only published project pages, newest first, with short factual notes', () => {
  const output = llms.llmsTxt({
    ...input,
    projects: [
      { id: 'old', data: { ...project, from: '2020', to: '2020', blocks: [{ type: 'text', body_cs: 'Starý text.', body_en: 'Old text.' }] } },
      { id: 'no-page', data: { ...project, title_cs: 'Bez stránky', title_en: 'No page' } },
      { id: 'draft', data: { ...project, draft: true, title_cs: 'Koncept', title_en: 'Draft', blocks: [{ type: 'text', body_cs: 'Koncept.', body_en: 'Draft.' }] } },
      { id: 'new', data: { ...project, from: '2025', to: '2025', location_cs: 'Brno, Česko', location_en: 'Brno, Czechia', brief_cs: 'Dlouhá anotace. '.repeat(100), brief_en: 'Long brief. '.repeat(100), blocks: [{ type: 'text', body_cs: 'Lorem ipsum.', body_en: 'Long body.' }] } },
    ],
  });
  expect(indexLinks(output).map((link) => link.href)).toEqual([
    'https://example.cz/about/', 'https://example.cz/work/',
    'https://example.cz/projects/new/', 'https://example.cz/projects/old/',
    'https://example.cz/llms-full.txt',
  ]);
  expect(output).toContain('2025');
  expect(output).toContain('Brno, Česko / Brno, Czechia');
  for (const omitted of ['Bez stránky', 'Koncept', 'Dlouhá anotace', 'Lorem ipsum', 'Long body']) expect(output).not.toContain(omitted);
  expect(output.length).toBeLessThan(2000);
});

test('Markdown links preserve literal CMS titles and encoded paths', () => {
  const title = 'Dům [A] *B* _C_ `D` \\ E <F>';
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'dům (A)', data: { ...project, title_cs: title, title_en: title, blocks: [{ type: 'text', body_cs: 'Text.', body_en: 'Text.' }] } }],
  });
  const link = indexLinks(output).find((entry) => entry.href.includes('/projects/'))!;
  expect(link.href).toBe('https://example.cz/projects/d%C5%AFm%20(A)/');
  expect(link.tokens.every((token) => token.type === 'text' || token.type === 'escape')).toBe(true);
  expect(link.tokens.map((token) => token.type === 'escape' ? token.raw.slice(1) : token.raw).join('')).toBe(title);
});

test.each([
  ['~~A~~', '~~A~~'],
  ['&copy;', '&amp;copy;'],
  ['Nadpis\n\nTitle', 'Nadpis Title'],
])('inline project links preserve literal CMS title %j', (title, rendered) => {
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'inline', data: {
      ...project, title_cs: title, title_en: title,
      blocks: [{ type: 'text', body_cs: 'Text.', body_en: 'Text.' }],
    } }],
  });
  const link = indexLinks(output).find((entry) => entry.href.includes('/projects/'))!;
  expect(link.tokens.every((token) => token.type === 'text' || token.type === 'escape')).toBe(true);
  expect(parseInline(link.raw)).toContain(`>${rendered}</a>`);
});

test('multiline location notes keep the index link list intact', () => {
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'inline', data: {
      ...project,
      location_cs: 'Praha\n\n## Vložená sekce', location_en: 'Prague\n\n## Inserted section',
      blocks: [{ type: 'text', body_cs: 'Text.', body_en: 'Text.' }],
    } }],
  });
  indexLinks(output);
  expect(output).toContain(': Praha ## Vložená sekce / Prague ## Inserted section ·');
});

test('the full export retains facts, full URLs, personal roles, credits and language-labelled prose', () => {
  const project_url = 'https://example.org/projects/library?view=plan#drawings';
  const output = llms.llmsFullTxt({
    ...input,
    about: {
      ...about,
      experience: [{ place_cs: 'Ateliér', place_en: 'Studio', from: '3/2024', title_cs: 'Architektka', title_en: 'Architect', description_cs: 'Rodinné domy.\nInteriéry.', description_en: 'Family houses.\nInteriors.' }],
      services: [{ name_cs: 'Rodinné domy', name_en: 'Family houses' }],
      education: [{ place_cs: 'Škola', place_en: 'School', from: '2020', to: '2024', title_cs: 'Architektura', title_en: 'Architecture' }],
      awards: [{ place_cs: 'Soutěž', place_en: 'Competition', from: '2025', to: '2025', title_cs: '1. místo', title_en: '1st place' }],
    },
    contact: { ...contact, phone: '+420 777 000 000', location_cs: 'Brno', location_en: 'Brno' },
    projects: [{ id: 'library', data: {
      ...project, project_url, realization: 'built', studio: 'Ateliér A',
      brief_cs: 'Knihovna s veřejnou zahradou.', brief_en: 'A library with a public garden.',
      role_cs: 'Návrh interiéru', role_en: 'Interior design',
      collaborators: [{ name: 'Jan Novák', role_cs: 'Statika', role_en: 'Structural design' }],
      blocks: [{ type: 'text', body_cs: 'Text projektu.', body_en: 'Project text.' }],
    } }],
  });
  for (const fact of [project_url, 'Moje role / My role: Návrh interiéru / Interior design', 'Spolupráce / Collaborators: Jan Novák – Statika / Structural design', 'Ateliér A', 'Realizováno / Built', '+420 777 000 000', 'Rodinné domy.', 'Family houses.', 'Architektura – Škola', '1. místo – Soutěž']) expect(output).toContain(fact);
  for (const [cs, en] of [[about.body_cs, about.body_en], ['Knihovna s veřejnou zahradou.', 'A library with a public garden.'], ['Text projektu.', 'Project text.']]) {
    expect(output).toContain(`**Česky (cs):**\n\n${cs}\n\n**English (en):**\n\n${en}`);
  }
});

test('the full export labels identical passages in both languages and links captioned images', () => {
  const output = llms.llmsFullTxt({
    ...input,
    projects: [{ id: 'gallery', data: { ...project, blocks: [
      { type: 'text', body_cs: 'Lorem ipsum.', body_en: 'Lorem ipsum.' },
      { type: 'gallery', images: [
        { image: '/uploads/plán (A).png', title_cs: 'Půdorys [A]', title_en: 'Plan [A]', description_cs: 'Popis.', description_en: 'Description.' },
        { image: '/uploads/untitled.png' },
        { image: '/uploads/c.png', description_cs: 'Další popis.', description_en: 'Another description.' },
      ] },
    ] } }],
  });
  expect(output).toContain('**Česky (cs):**\n\nLorem ipsum.\n\n**English (en):**\n\nLorem ipsum.');
  const headings = Lexer.lex(output).filter((token): token is Tokens.Heading => token.type === 'heading' && token.depth === 4);
  expect(headings).toHaveLength(2);
  const links = headings.map((heading) => heading.tokens[0] as Tokens.Link);
  expect(links.map((link) => link.href)).toEqual(['https://example.cz/uploads/pl%C3%A1n%20(A).png', 'https://example.cz/uploads/c.png']);
  expect(links[0].text).toContain('Půdorys');
  expect(links[1].text).toBe('Obrázek 3 / Image 3');
  expect(output).toContain('**Česky (cs):**\n\nPopis.\n\n**English (en):**\n\nDescription.');
  expect(output).not.toContain('untitled.png');
});

test('the full export includes projects without pages, excludes drafts and leaves out empty sections', () => {
  const output = llms.llmsFullTxt({
    ...input,
    projects: [
      { id: 'old', data: { ...project, title_cs: 'Starý', title_en: 'Old', from: '2020', to: '2020' } },
      { id: 'draft', data: { ...project, draft: true, title_cs: 'Koncept', title_en: 'Draft' } },
      { id: 'new', data: { ...project, title_cs: 'Nový', title_en: 'New', from: '2025', to: '2025', blocks: [{ type: 'text', body_cs: 'Text.', body_en: 'Text.' }] } },
    ],
  });
  expect(output.indexOf('### Nový / New')).toBeLessThan(output.indexOf('### Starý / Old'));
  expect(output).toContain('https://example.cz/projects/new/');
  expect(output).not.toContain('/projects/old/');
  expect(output).not.toContain('Koncept');
  for (const heading of ['Praxe', 'Služby', 'Vzdělání', 'Ocenění']) expect(output).not.toContain(`## ${heading}`);
});

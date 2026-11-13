import { expect, test } from 'vitest';
import { Lexer, parseInline, type Tokens } from 'marked';
import * as llms from './llms-txt';

const site = new URL('https://example.cz/');
const name = 'Ing. arch. Jana Nováková';
const about = {
  bio: { cs: 'Jsem **architektka**.', en: 'I am an **architect**.' },
  approaches: [], experience: [], services: [], education: [], awards: [],
};
const contact = { email: 'jana@example.cz' };
const project = {
  title: { cs: 'Galerie', en: 'Gallery' }, from: '2024', to: '2024',
  draft: false, context: [], intervention: [], scope: [],
  design_in_progress: false, role: [], collaborators: [], blocks: [],
};
const description = { cs: 'Portfolio architektky.', en: 'An architect’s portfolio.' };
const input = { site, name, about, contact, description, projects: [] };

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

test('llms.txt is a bilingual link index with a summary and language-specific canonical URL guidance', () => {
  const output = llms.llmsTxt(input);
  const tokens = Lexer.lex(output).filter((token) => token.type !== 'space');
  expect(tokens[0]).toMatchObject({ type: 'heading', depth: 1, text: name });
  expect(tokens[1]).toMatchObject({ type: 'blockquote' });
  expect(tokens[1].raw).toContain('Portfolio architektky.');
  expect(tokens[1].raw).toContain('An architect’s portfolio.');
  expect(tokens[2]).toMatchObject({ type: 'paragraph' });
  expect(tokens[2].raw).toContain('cs');
  expect(tokens[2].raw).toContain('en');
  expect(tokens[2].raw).toContain('/cs/');
  expect(tokens[2].raw).toContain('/en/');
  expect(indexLinks(output).map((link) => link.href)).toEqual([
    'https://example.cz/cs/about/', 'https://example.cz/cs/work/',
    'https://example.cz/en/about/', 'https://example.cz/en/work/', 'https://example.cz/llms-full.txt',
  ]);
  expect(output).toContain('O mně (cs)');
  expect(output).toContain('Work (en)');
  expect(output).not.toContain(about.bio.cs);
});

test('the index lists every published project in the work page’s order, linking its page or else the work page, with short factual notes', () => {
  const output = llms.llmsTxt({
    ...input,
    projects: [
      // A card: the work page's grid comes before its newer listed projects.
      { id: 'old', data: { ...project, from: '2020', to: '2020', blocks: [{ type: 'gallery', images: [{ image: '/uploads/old.png' }] }] } },
      { id: 'no-page', data: { ...project, title: { cs: 'Bez stránky', en: 'No page' } } },
      { id: 'draft', data: { ...project, draft: true, title: { cs: 'Koncept', en: 'Draft' }, blocks: [{ type: 'text', body: { cs: 'Koncept.', en: 'Draft.' } }] } },
      { id: 'new', data: { ...project, from: '2025', to: '2025', location: { cs: 'Brno, Česko', en: 'Brno, Czechia' }, brief: { cs: 'Dlouhá anotace. '.repeat(100), en: 'Long brief. '.repeat(100) }, blocks: [{ type: 'text', body: { cs: 'Lorem ipsum.', en: 'Long body.' } }] } },
    ],
  });
  expect(indexLinks(output).map((link) => link.href)).toEqual([
    'https://example.cz/cs/about/', 'https://example.cz/cs/work/',
    'https://example.cz/en/about/', 'https://example.cz/en/work/',
    'https://example.cz/cs/projects/old/', 'https://example.cz/en/projects/old/',
    'https://example.cz/cs/projects/new/', 'https://example.cz/en/projects/new/',
    'https://example.cz/cs/work/', 'https://example.cz/en/work/',
    'https://example.cz/llms-full.txt',
  ]);
  expect(output).toContain('2025');
  expect(output).toContain('Brno, Česko');
  expect(output).toContain('[Bez stránky (cs)]');
  expect(output).toContain('[No page (en)]');
  for (const omitted of ['Koncept', 'Dlouhá anotace', 'Lorem ipsum', 'Long body']) expect(output).not.toContain(omitted);
  expect(output.length).toBeLessThan(2500);
});

test('an index entry notes its project’s title badges, build status included, in its own language', () => {
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'hall', data: {
      ...project, context: ['competition'], design_in_progress: true, realization: 'construction',
      blocks: [{ type: 'text', body: { cs: 'Text.', en: 'Text.' } }],
    } }],
  });
  const entry = (lang: string) => output.split('\n').find((row) => row.includes(`(${lang})](<https://example.cz/${lang}/projects/hall/>)`))!;
  for (const badge of ['Soutěžní návrh', 'Probíhá projektování', 'Ve výstavbě']) expect(entry('cs')).toContain(badge);
  for (const badge of ['Competition entry', 'Design in progress', 'Under construction']) expect(entry('en')).toContain(badge);
  expect(entry('cs')).not.toContain('Under construction');
  expect(entry('en')).not.toContain('Ve výstavbě');
});

test('the index says how to reach the architect', () => {
  expect(llms.llmsTxt({
    ...input,
    contact: { ...contact, phone: '+420 777 000 000', location: { cs: 'Brno', en: 'Brno' } },
  })).toContain('\n\nKontakt / Contact: jana@example.cz · +420 777 000 000 · Brno\n\n');
  expect(llms.llmsTxt(input)).toContain('\n\nKontakt / Contact: jana@example.cz\n\n');
});

test('Markdown links preserve literal CMS titles and encoded paths', () => {
  const title = 'Dům [A] *B* _C_ `D` \\ E <F>';
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'dům (A)', data: { ...project, title: { cs: title, en: title }, blocks: [{ type: 'text', body: { cs: 'Text.', en: 'Text.' } }] } }],
  });
  const link = indexLinks(output).find((entry) => entry.href.includes('/projects/'))!;
  expect(link.href).toBe('https://example.cz/cs/projects/d%C5%AFm%20(A)/');
  expect(link.tokens.every((token) => token.type === 'text' || token.type === 'escape')).toBe(true);
  expect(link.tokens.map((token) => token.type === 'escape' ? token.raw.slice(1) : token.raw).join('')).toBe(`${title} (cs)`);
});

test.each([
  ['~~A~~', '~~A~~'],
  ['&copy;', '&amp;copy;'],
  ['Nadpis\n\nTitle', 'Nadpis Title'],
])('inline project links preserve literal CMS title %j', (title, rendered) => {
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'inline', data: {
      ...project, title: { cs: title, en: title },
      blocks: [{ type: 'text', body: { cs: 'Text.', en: 'Text.' } }],
    } }],
  });
  const link = indexLinks(output).find((entry) => entry.href.includes('/projects/'))!;
  expect(link.tokens.every((token) => token.type === 'text' || token.type === 'escape')).toBe(true);
  expect(parseInline(link.raw)).toContain(`>${rendered} (cs)</a>`);
});

test('multiline location notes keep the index link list intact', () => {
  const output = llms.llmsTxt({
    ...input,
    projects: [{ id: 'inline', data: {
      ...project,
      location: { cs: 'Praha\n\n## Vložená sekce', en: 'Prague\n\n## Inserted section' },
      blocks: [{ type: 'text', body: { cs: 'Text.', en: 'Text.' } }],
    } }],
  });
  indexLinks(output);
  expect(output).toContain(': Praha ## Vložená sekce ·')
  expect(output).toContain(': Prague ## Inserted section ·');
});

test('the full export retains facts, full URLs, personal roles, credits and language-labelled prose', () => {
  const project_url = 'https://example.org/projects/library?view=plan#drawings';
  const output = llms.llmsFullTxt({
    ...input,
    about: {
      ...about,
      approaches: [{ label: { cs: 'Místo', en: 'Place' }, text: { cs: 'Stavím z místa.', en: 'I build from the place.' }, icon: 'place' }],
      experience: [{ place: { cs: 'Ateliér', en: 'Studio' }, from: '3/2024', title: { cs: 'Architektka', en: 'Architect' }, description: { cs: 'Rodinné domy.\nInteriéry.', en: 'Family houses.\nInteriors.' } }],
      services: [{ name: { cs: 'Rodinné domy', en: 'Family houses' } }],
      education: [{ place: { cs: 'Škola', en: 'School' }, from: '2020', to: '2024', title: { cs: 'Architektura', en: 'Architecture' }, degree: 'Bc.' }],
      awards: [{ place: { cs: 'Soutěž', en: 'Competition' }, from: '2025', to: '2025', title: { cs: '1. místo', en: '1st place' } }],
    },
    contact: { ...contact, phone: '+420 777 000 000', location: { cs: 'Brno', en: 'Brno' }, hours: { cs: 'Po–Pá 9–17', en: 'Weekdays 9 am to 5 pm' }, ico: '12345678', seat: 'Na Poříčí 12, Praha' },
    projects: [{ id: 'library', data: {
      ...project, project_url, realization: 'built', studio: 'Ateliér A',
      brief: { cs: 'Knihovna s veřejnou zahradou.', en: 'A library with a public garden.' },
      role: [{ cs: 'Návrh interiéru', en: 'Interior design' }, { cs: 'Dokumentace', en: 'Documentation' }],
      collaborators: [{ name: 'Jan Novák', role: { cs: 'Statika', en: 'Structural design' } }],
      blocks: [{ type: 'text', body: { cs: 'Text projektu.', en: 'Project text.' } }],
    } }],
  });
  for (const fact of [project_url, 'Moje role / My role: Návrh interiéru / Interior design; Dokumentace / Documentation', 'Spolupráce / Collaborators: Jan Novák – Statika / Structural design', 'Ateliér A', 'Realizováno / Built', '+420 777 000 000', 'IČO / Business ID: 12345678', 'Fyzická osoba zapsaná v živnostenském rejstříku / Sole trader registered in the Czech Trade Register', 'Sídlo / Registered office: Na Poříčí 12, Praha', 'Čas pro telefonické hovory: Po–Pá 9–17 / Phone call hours: Weekdays 9 am to 5 pm', 'Architektka / Architect', '## Přístup / Approach', '### Místo / Place', 'Rodinné domy.', 'Family houses.', '2020–2024 · Bc. · Architektura – Škola / Architecture – School', '1. místo – Soutěž']) expect(output).toContain(fact);
  for (const [cs, en] of [[about.bio.cs, about.bio.en], ['Knihovna s veřejnou zahradou.', 'A library with a public garden.'], ['Text projektu.', 'Project text.'], ['Stavím z místa.', 'I build from the place.']]) {
    expect(output).toContain(`**Česky (cs):**\n\n${cs}\n\n**English (en):**\n\n${en}`);
  }
});

test('the full export labels identical passages in both languages and links captioned images', () => {
  const output = llms.llmsFullTxt({
    ...input,
    projects: [{ id: 'gallery', data: { ...project, blocks: [
      { type: 'text', body: { cs: 'Lorem ipsum.', en: 'Lorem ipsum.' } },
      { type: 'gallery', images: [
        { image: '/uploads/plán (A).png', title: { cs: 'Půdorys [A]', en: 'Plan [A]' }, description: { cs: 'Popis.', en: 'Description.' } },
        { image: '/uploads/untitled.png' },
        { image: '/uploads/c.png', description: { cs: 'Další popis.', en: 'Another description.' } },
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
  // The page numbers every image, untitled ones too.
  for (const position of [1, 3]) {
    expect(output).toContain(`- Na stránce / On the page: [cs](<https://example.cz/cs/projects/gallery/#image-${position}>) · [en](<https://example.cz/en/projects/gallery/#image-${position}>)`);
  }
  expect(output).not.toContain('#image-2');
});

test('the full export names the other images of each image’s comparison set', () => {
  const output = llms.llmsFullTxt({
    ...input,
    projects: [{ id: 'sets', data: { ...project, blocks: [
      { type: 'gallery', images: [
        { image: '/uploads/a.png', comparison_set: 'plans', title: { cs: 'Půdorys', en: 'Plan' } },
        { image: '/uploads/b.png', comparison_set: 'plans' },
        { image: '/uploads/c.png', title: { cs: 'Řez', en: 'Section' } },
      ] },
      { type: 'image_set', images: [
        { image: '/uploads/d.png', comparison_set: ' plans ' },
        { image: '/uploads/e.png', comparison_set: 'alone', title: { cs: 'Sám', en: 'Alone' } },
      ] },
    ] } }],
  });
  const headings = Lexer.lex(output).filter((token): token is Tokens.Heading => token.type === 'heading' && token.depth === 4);
  expect(headings.map((heading) => heading.text)).toEqual(expect.arrayContaining([expect.stringContaining('Obrázek 2 / Image 2'), expect.stringContaining('Obrázek 4 / Image 4')]));
  expect(output).toContain('- Obrázky v sadě / Images in this set: Obrázek 2 / Image 2; Obrázek 4 / Image 4');
  expect(output).toContain('- Obrázky v sadě / Images in this set: Půdorys / Plan; Obrázek 4 / Image 4');
  expect(output).toContain('- Obrázky v sadě / Images in this set: Půdorys / Plan; Obrázek 2 / Image 2');
  expect(output.match(/Obrázky v sadě/g)).toHaveLength(3);
});

test('the full export lists projects in the work page’s order, includes projects without pages, excludes drafts and leaves out empty sections', () => {
  const output = llms.llmsFullTxt({
    ...input,
    projects: [
      // A card: the work page's grid comes before its newer listed projects.
      { id: 'card', data: { ...project, title: { cs: 'Karta', en: 'Card' }, from: '2019', to: '2019', blocks: [{ type: 'gallery', images: [{ image: '/uploads/card.png' }] }] } },
      { id: 'old', data: { ...project, title: { cs: 'Starý', en: 'Old' }, from: '2020', to: '2020' } },
      { id: 'draft', data: { ...project, draft: true, title: { cs: 'Koncept', en: 'Draft' } } },
      { id: 'new', data: { ...project, title: { cs: 'Nový', en: 'New' }, from: '2025', to: '2025', blocks: [{ type: 'text', body: { cs: 'Text.', en: 'Text.' } }] } },
    ],
  });
  expect(output.indexOf('### Karta / Card')).toBeLessThan(output.indexOf('### Nový / New'));
  expect(output.indexOf('### Nový / New')).toBeLessThan(output.indexOf('### Starý / Old'));
  expect(output).toContain('https://example.cz/cs/projects/new/')
  expect(output).toContain('https://example.cz/en/projects/new/');
  expect(output).not.toContain('/projects/old/');
  expect(output).not.toContain('Koncept');
  for (const heading of ['Přístup', 'Praxe', 'Služby', 'Vzdělání', 'Ocenění']) expect(output).not.toContain(`## ${heading}`);
  for (const fact of ['IČO', 'živnostenském', 'Sídlo', 'hovory']) expect(output).not.toContain(fact);
});

import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { Lexer, type Tokens } from 'marked';
import type { ImageManifest } from '../../src/images';
import { contact, site } from './architect';
import { thumbnailProjects } from './thumbnail-projects';

const owner = `${site.credential} ${site.name}`;
const origin = `https://${readFileSync('public/CNAME', 'utf8').trim()}`;

const meta = (page: Page, attribute: string) => page.locator(`meta[${attribute}]`);

async function graph(page: Page) {
  const scripts = page.locator('script[type="application/ld+json"]');
  await expect(scripts).toHaveCount(1);
  const data = JSON.parse((await scripts.textContent())!);
  expect(data['@context']).toBe('https://schema.org');
  return data['@graph'] as Record<string, unknown>[];
}

const node = (nodes: Record<string, unknown>[], type: string) =>
  nodes.find((item) => item['@type'] === type);

const manifest = async (page: Page) =>
  (await (await page.request.get('/_responsive/manifest.json')).json()) as ImageManifest;

/** The page shares a JPEG of its first project card's cover. */
async function expectSharesFirstCard(page: Page) {
  const image = await meta(page, 'property="og:image"').getAttribute('content');
  expect(image).toMatch(new RegExp(`^${origin}/.+\\.jpg$`));
  expect((await page.request.get(new URL(image!).pathname)).ok()).toBe(true);
  // The image manifest names each upload's derivatives: the share JPEG must
  // come from the same upload as the first card's thumbnails.
  const shared = Object.values((await manifest(page)).images).find(
    (entry) => entry.share?.url === new URL(image!).pathname,
  );
  const card = await page.locator('main .grid > a img').first().getAttribute('srcset');
  expect(shared?.variants.map((variant) => variant.url)).toContain(card!.split(' ')[0]);
}

test.describe(() => {
  test.use({ javaScriptEnabled: false });

  test('a project page is described by its brief, in Czech as served', async ({ page }) => {
    await page.goto('/cs/e2e/brief/');
    await expect(meta(page, 'name="description"')).toHaveAttribute(
      'content',
      'Anotace stránky. Druhý řádek.',
    );
    await expect(meta(page, 'property="og:description"')).toHaveAttribute(
      'content',
      'Anotace stránky. Druhý řádek.',
    );
  });

  test('About, Work and the legal page describe themselves', async ({ page }) => {
    for (const [path, description] of [
      // tests/e2e/pages/[fixture].astro: the bio cut at a word boundary, and
      // the project titles in page order.
      ['/cs/e2e/about/', 'Výkres sleduje, jak se náměstí, park a stadion potkávají podél řeky a kudy by je mohla spojit nová cesta. Výkres sleduje, jak se náměstí, park a stadion…'],
      ['/en/e2e/work/', 'Grid project, Alpha brief, Beta text, Old brief'],
      ['/cs/e2e/legal/', 'Identifikační údaje, ochrana osobních údajů a spotřebitelské spory.'],
    ]) {
      await page.goto(path);
      await expect(meta(page, 'name="description"'), path).toHaveAttribute('content', description);
    }
  });

  test('a project page shares its cover as an absolute JPEG', async ({ page }) => {
    await page.goto('/cs/e2e/project/');
    const image = await meta(page, 'property="og:image"').getAttribute('content');
    expect(image).toMatch(new RegExp(`^${origin}/.+\\.jpg$`));
    await expect(meta(page, 'property="og:image:type"')).toHaveAttribute('content', 'image/jpeg');
    expect(Number(await meta(page, 'property="og:image:width"').getAttribute('content'))).toBe(1200);
    expect(Number(await meta(page, 'property="og:image:height"').getAttribute('content'))).toBeGreaterThan(0);
    await expect(meta(page, 'name="twitter:image"')).toHaveAttribute('content', image!);
    await expect(meta(page, 'name="twitter:card"')).toHaveAttribute('content', 'summary_large_image');
    await expect(meta(page, 'property="og:type"')).toHaveAttribute('content', 'article');
    const served = await page.request.get(new URL(image!).pathname);
    expect(served.ok()).toBe(true);
    expect(served.headers()['content-type']).toBe('image/jpeg');
  });

  for (const path of ['/e2e/vector-only/', '/e2e/text-only/']) {
    test(`a page with no raster image shares none (${path})`, async ({ page }) => {
      await page.goto(path);
      await expect(meta(page, 'property^="og:image"')).toHaveCount(0);
      await expect(meta(page, 'name="twitter:image"')).toHaveCount(0);
      await expect(meta(page, 'name="twitter:card"')).toHaveAttribute('content', 'summary');
    });
  }

  test('every page names its canonical address and the site', async ({ page }) => {
    for (const [path, type] of [
      ['/cs/e2e/landing/', 'website'],
      ['/cs/e2e/work/', 'website'],
      ['/cs/e2e/about/', 'website'],
      ['/cs/e2e/brief/', 'article'],
    ]) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
      await expect(page.locator('link[rel="describedby"]')).toHaveAttribute('href', '/llms.txt');
      await expect(page.locator('link[rel="describedby"]')).toHaveAttribute('type', 'text/plain');
      await expect(meta(page, 'property="og:url"')).toHaveAttribute('content', `${origin}${path}`);
      await expect(meta(page, 'property="og:type"')).toHaveAttribute('content', type);
      await expect(meta(page, 'property="og:site_name"')).toHaveAttribute('content', owner);
      await expect(meta(page, 'property="og:locale"')).toHaveAttribute('content', 'cs_CZ');
      await expect(meta(page, 'property="og:locale:alternate"')).toHaveAttribute('content', 'en_US');
    }
  });

  test('a non-ASCII page address is percent-encoded as in the sitemap', async ({ page, request }) => {
    const path = encodeURI('/cs/e2e/náměstí/');
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
    await expect(meta(page, 'property="og:url"')).toHaveAttribute('content', `${origin}${path}`);
    expect(await (await request.get('/sitemap-0.xml')).text()).toContain(`<loc>${origin}${path}</loc>`);
  });

  test('every page describes the architect as structured data', async ({ page }) => {
    for (const path of ['/cs/e2e/landing/', '/cs/e2e/work/', '/cs/e2e/about/', '/cs/e2e/project/']) {
      await page.goto(path);
      const architect = node(await graph(page), 'Person');
      expect(architect).toMatchObject({
        '@id': `${origin}/#person`,
        name: site.name,
        url: `${origin}/cs/`,
        workLocation: { '@type': 'Place', name: contact.location.cs },
      });
      expect(architect).not.toHaveProperty('knowsLanguage');
      expect(architect).not.toHaveProperty('hasCredential');
    }
  });

  test('the landing page is the website', async ({ page }) => {
    await page.goto('/cs/e2e/landing/');
    expect(node(await graph(page), 'WebSite')).toMatchObject({ name: owner, url: `${origin}/` });
  });

  test('the landing page shares its first raster hero image', async ({ page }) => {
    // tests/e2e/pages/[fixture].astro: an SVG, then two rasters.
    await page.goto('/cs/e2e/landing/');
    const { images } = await manifest(page);
    await expect(meta(page, 'property="og:image"')).toHaveAttribute(
      'content',
      `${origin}${images['/e2e/images/wide.png'].share.url}`,
    );
  });

  test('the landing page without a raster hero image shares its first project\'s cover', async ({
    page,
  }) => {
    await page.goto('/cs/e2e/landing-single/');
    await expectSharesFirstCard(page);
  });

  test('the work page shares its first cover', async ({ page }) => {
    await page.goto('/cs/e2e/work/');
    await expectSharesFirstCard(page);
  });

  test('the about page is the architect’s profile', async ({ page }) => {
    await page.goto('/cs/e2e/about/');
    expect(node(await graph(page), 'ProfilePage')).toMatchObject({
      url: `${origin}/cs/e2e/about/`,
      mainEntity: { '@id': `${origin}/#person` },
    });
  });

  test('the not-found page is kept out of search', async ({ page }) => {
    await page.goto('/404.html');
    await expect(meta(page, 'name="robots"')).toHaveAttribute('content', 'noindex');
  });

  test('project metadata preserves collaborator roles without inferring ownership', async ({ page }) => {
    await page.goto('/cs/e2e/credits/');
    const work = node(await graph(page), 'CreativeWork')!;
    expect(work).not.toHaveProperty('creator');
    expect(work.contributor).toEqual([
      { '@id': `${origin}/#person` },
      { '@type': 'Role', roleName: 'Autor návrhu · koordinace', contributor: { '@type': 'Person', name: 'Jan Novák' } },
      { '@type': 'Role', roleName: 'Autor návrhu', contributor: { '@type': 'Person', name: 'Eva Dvořáková' } },
      { '@type': 'Role', roleName: 'vizualizace', contributor: { '@type': 'Person', name: 'Ing. Petr Malý' } },
      { '@type': 'Role', roleName: 'statika', contributor: { '@type': 'Person', name: 'Ing. Pavel Velký' } },
      { '@type': 'Person', name: 'Ing. Iva Tichá' },
    ]);
  });

  test('a project page is a creative work by the architect, with its described images', async ({
    page,
  }) => {
    await page.goto('/cs/e2e/project/');
    const work = node(await graph(page), 'CreativeWork')!;
    expect(work).toMatchObject({
      name: 'Testovací projekt',
      contentLocation: { '@type': 'Place', name: 'Nikde' },
      url: `${origin}/cs/e2e/project/`,
    });
    expect(work).not.toHaveProperty('dateCreated');
    expect(work).not.toHaveProperty('creator');
    const images = work.image as Record<string, string>[];
    // The untitled cover comes first, as the lightbox's largest derivative.
    expect(images[0]).toEqual({
      '@type': 'ImageObject',
      contentUrl: expect.stringMatching(new RegExp(`^${origin}/_responsive/.+\\.webp$`)),
    });
    expect((await page.request.get(new URL(images[0].contentUrl).pathname)).ok()).toBe(true);
    expect(images).toContainEqual({
      '@type': 'ImageObject',
      contentUrl: `${origin}/e2e/images/vector.svg`,
      name: 'Vektor 17 – Testovací projekt, Nikde',
      caption: 'Krátká poznámka.',
    });
    for (const image of images.slice(1)) expect(image.name ?? image.caption).toBeTruthy();
  });

});

test('the sitemap lists the pages but not the not-found page', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  for (const path of ['/cs/', '/cs/work/', '/cs/about/', '/cs/legal/', '/en/', '/en/work/', '/en/about/', '/en/legal/']) {
    expect(sitemap).toContain(`<loc>${origin}${path}</loc>`);
  }
  for (const path of ['/404/', '/404.html', '/', '/about/', '/work/']) {
    expect(sitemap).not.toContain(`<loc>${origin}${path}</loc>`);
  }
});

test('robots.txt allows crawling and names the sitemap', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  const text = await robots.text();
  expect(text).toMatch(/^User-agent: \*$/m);
  expect(text).toMatch(/^Allow: \/$/m);
  const sitemap = text.match(/^Sitemap: (.+)$/m)![1];
  expect(sitemap).toBe(`${origin}/sitemap-index.xml`);
  expect((await request.get(new URL(sitemap).pathname)).ok()).toBe(true);
});

/** The links of a full AI export's headings: its projects' captioned images. */
const headingLinks = (full: string) =>
  Lexer.lex(full)
    .filter((token): token is Tokens.Heading => token.type === 'heading')
    .flatMap((heading) => heading.tokens.filter((token): token is Tokens.Link => token.type === 'link'))
    .map((link) => link.href);

async function expectLinksResolve(request: APIRequestContext, urls: string[]) {
  for (const url of new Set(urls)) {
    expect(new URL(url).origin).toBe(origin);
    expect((await request.get(new URL(url).pathname)).ok(), url).toBe(true);
  }
}

test('the AI exports are served as text and their links resolve', async ({ request }) => {
  const [text, full] = await Promise.all(['/llms.txt', '/llms-full.txt'].map(async (path) => {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()['content-type'], path).toContain('text/plain');
    return response.text();
  }));
  // Each index entry starts with its link.
  const indexLinks = Lexer.lex(text)
    .filter((token): token is Tokens.List => token.type === 'list')
    .flatMap((list) => list.items.map((item) => Lexer.lexInline(item.text)[0]))
    .filter((token): token is Tokens.Link => token.type === 'link')
    .map((link) => link.href);
  await expectLinksResolve(request, [...indexLinks, ...headingLinks(full)]);
});

// tests/e2e/pages/ai-export.ts: the exports of the thumbnail fixture projects.
test('llms.txt indexes canonical language pages and llms-full.txt retains published content', async ({
  request,
}) => {
  const text = await (await request.get('/e2e/llms.txt')).text();
  const full = await (await request.get('/e2e/llms-full.txt')).text();
  expect(text.startsWith(`# ${owner}\n`)).toBe(true);
  expect(full.startsWith(`# ${owner}\n`)).toBe(true);
  for (const description of [site.description.cs, site.description.en]) expect(text).toContain(description);
  expect(text).toContain('cs');
  expect(text).toContain('en');
  expect(full).toContain('**Česky (cs):**');
  expect(full).toContain('**English (en):**');

  const tokens = Lexer.lex(text).filter((token) => token.type !== 'space');
  const firstSection = tokens.findIndex((token) => token.type === 'heading' && token.depth === 2);
  const links: Tokens.Link[] = [];
  for (const [position, token] of tokens.slice(firstSection).entries()) {
    if (position % 2 === 0) expect(token).toMatchObject({ type: 'heading', depth: 2 });
    else {
      expect(token.type).toBe('list');
      for (const item of (token as Tokens.List).items) {
        const inline = Lexer.lexInline(item.text);
        expect(inline[0].type).toBe('link');
        expect(inline[1].raw).toMatch(/^: \S/);
        links.push(inline[0] as Tokens.Link);
      }
    }
  }
  const urls = links.map((link) => link.href);
  for (const url of urls.filter((url) => !url.endsWith('.txt'))) {
    expect(new URL(url).pathname).toMatch(/^\/(cs|en)\//);
  }
  for (const path of ['/cs/about/', '/en/about/', '/cs/work/', '/en/work/', '/llms-full.txt']) expect(urls).toContain(`${origin}${path}`);

  const pageProjects = thumbnailProjects.filter(({ data }) => data.blocks.length > 0);
  expect(urls.filter((url) => new URL(url).pathname.includes('/projects/'))).toHaveLength(pageProjects.length * 2);
  for (const { data } of thumbnailProjects) {
    expect(full).toContain(data.title.cs);
    expect(full).toContain(data.title.en);
    const projectLink = links.find((link) => link.href.startsWith(`${origin}/cs/projects/`) && link.text.includes(data.title.cs));
    if (data.blocks.length > 0) {
      expect(projectLink).toBeDefined();
      expect(links.some((link) => link.href.startsWith(`${origin}/en/projects/`) && link.text.includes(data.title.en))).toBe(true);
    } else expect(projectLink).toBeUndefined();
  }

  const fullLinks = headingLinks(full);
  expect(fullLinks.length).toBeGreaterThan(0);
  await expectLinksResolve(request, [...urls, ...fullLinks]);
});

test('English structured data follows the page while the architect identity stays shared', async ({ page }) => {
  await page.goto('/en/e2e/project-role/');
  const nodes = await graph(page);
  expect(node(nodes, 'Person')).toMatchObject({
    '@id': `${origin}/#person`, jobTitle: 'Architect', url: `${origin}/en/`,
  });
  expect(node(nodes, 'CreativeWork')).toMatchObject({
    name: 'Test project', inLanguage: 'en',
    contentLocation: { name: 'Nowhere' }, url: `${origin}/en/e2e/project-role/`,
    contributor: [
      { '@type': 'Role', roleName: 'Interior design, documentation', contributor: { '@id': `${origin}/#person` } },
      { '@type': 'Role', roleName: 'Structural design', contributor: { '@type': 'Person', name: 'Jan Novák' } },
    ],
  });
  await page.goto('/en/e2e/project/');
  const work = node(await graph(page), 'CreativeWork')!;
  expect(work.image).toContainEqual({
    '@type': 'ImageObject', contentUrl: `${origin}/e2e/images/vector.svg`,
    name: 'Vector 17 – Test project, Nowhere', caption: 'A short note.',
  });
  await page.goto('/en/e2e/about/');
  const architect = node(await graph(page), 'Person')!;
  expect(architect['@id']).toBe(`${origin}/#person`);
});

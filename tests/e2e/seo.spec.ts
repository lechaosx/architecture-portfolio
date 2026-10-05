import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';

const frontmatter = (path: string) => parse(readFileSync(path, 'utf8').split('---')[1]);
const site = frontmatter('src/content/singletons/site.md');
const owner = [site.credential, site.name].filter(Boolean).join(' ');
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

test.describe(() => {
  test.use({ javaScriptEnabled: false });

  test('a project page is described by its brief, in Czech as served', async ({ page }) => {
    await page.goto('/e2e/brief/');
    await expect(meta(page, 'name="description"')).toHaveAttribute(
      'content',
      'Anotace stránky. Druhý řádek.',
    );
    await expect(meta(page, 'property="og:description"')).toHaveAttribute(
      'content',
      'Anotace stránky. Druhý řádek.',
    );
  });

  test('a project page shares its cover as an absolute JPEG', async ({ page }) => {
    await page.goto('/e2e/project/');
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
      ['/', 'website'],
      ['/work/', 'website'],
      ['/contact/', 'website'],
      ['/e2e/brief/', 'article'],
    ]) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
      await expect(meta(page, 'property="og:url"')).toHaveAttribute('content', `${origin}${path}`);
      await expect(meta(page, 'property="og:type"')).toHaveAttribute('content', type);
      await expect(meta(page, 'property="og:site_name"')).toHaveAttribute('content', owner);
      await expect(meta(page, 'property="og:locale"')).toHaveAttribute('content', 'cs_CZ');
      await expect(meta(page, 'property="og:locale:alternate"')).toHaveAttribute('content', 'en_US');
    }
  });

  test('a non-ASCII page address is percent-encoded as in the sitemap', async ({ page, request }) => {
    const path = encodeURI('/e2e/náměstí/');
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
    await expect(meta(page, 'property="og:url"')).toHaveAttribute('content', `${origin}${path}`);
    expect(await (await request.get('/sitemap-0.xml')).text()).toContain(`<loc>${origin}${path}</loc>`);
  });

  test('every page describes the architect as structured data', async ({ page }) => {
    for (const path of ['/', '/work/', '/contact/', '/e2e/project/']) {
      await page.goto(path);
      expect(node(await graph(page), 'Person')).toMatchObject({
        '@id': `${origin}/#person`,
        name: site.name,
        url: `${origin}/`,
        knowsLanguage: ['cs', 'en'],
      });
    }
  });

  test('the home page is the website and the architect’s profile', async ({ page }) => {
    await page.goto('/');
    const nodes = await graph(page);
    expect(node(nodes, 'WebSite')).toMatchObject({ name: owner, url: `${origin}/` });
    expect(node(nodes, 'ProfilePage')).toMatchObject({
      mainEntity: { '@id': `${origin}/#person` },
    });
  });

  test('a project page is a creative work by the architect, with its described images', async ({
    page,
  }) => {
    await page.goto('/e2e/project/');
    const work = node(await graph(page), 'CreativeWork')!;
    expect(work).toMatchObject({
      name: 'Testovací projekt',
      dateCreated: '2026',
      locationCreated: { '@type': 'Place', name: 'Nikde' },
      url: `${origin}/e2e/project/`,
      creator: { '@id': `${origin}/#person` },
    });
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
      name: 'Vektor 17',
      caption: 'Krátká poznámka.',
    });
    for (const image of images.slice(1)) expect(image.name ?? image.caption).toBeTruthy();
  });

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

test('llms.txt presents the architect and her published projects, linking pages that exist', async ({
  request,
}) => {
  const response = await request.get('/llms.txt');
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text.startsWith(`# ${owner}\n`)).toBe(true);

  const projects = readdirSync('src/content/projects').map((file) =>
    frontmatter(`src/content/projects/${file}`),
  );
  for (const project of projects) {
    if (project.draft) expect(text).not.toContain(project.title_cs);
    else expect(text).toContain(project.title_cs);
  }

  const links = text.match(new RegExp(`${origin}/\\S*`, 'g')) ?? [];
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect((await request.get(new URL(link).pathname)).ok(), link).toBe(true);
  }
});

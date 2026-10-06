import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { parse } from 'yaml';
import type { ImageManifest } from '../../src/images';

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

/** A page's head and body as served, read without following its refresh. */
async function served(page: Page, request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text();
  return page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      title: doc.title,
      canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      refresh: doc.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content'),
      meta: Array.from(
        doc.querySelectorAll(
          'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]',
        ),
        (meta) => [
          meta.getAttribute('name') ?? meta.getAttribute('property'),
          meta.getAttribute('content'),
        ],
      ),
      body: Array.from(doc.body.children, (child) => ({
        tag: child.tagName,
        href: child.getAttribute('href'),
      })),
    };
  }, html);
}

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
      ['/work/', 'website'],
      ['/about/', 'website'],
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
    for (const path of ['/work/', '/about/', '/e2e/project/']) {
      await page.goto(path);
      expect(node(await graph(page), 'Person')).toMatchObject({
        '@id': `${origin}/#person`,
        name: site.name,
        url: `${origin}/`,
        knowsLanguage: ['cs', 'en'],
      });
    }
  });

  test('the work page is the website and shares its first cover', async ({ page }) => {
    await page.goto('/work/');
    expect(node(await graph(page), 'WebSite')).toMatchObject({ name: owner, url: `${origin}/` });
    const image = await meta(page, 'property="og:image"').getAttribute('content');
    expect(image).toMatch(new RegExp(`^${origin}/.+\\.jpg$`));
    expect((await page.request.get(new URL(image!).pathname)).ok()).toBe(true);
    // The image manifest names each upload's derivatives: the share JPEG must
    // come from the same upload as the first card's thumbnails.
    const { images } = (await (
      await page.request.get('/_responsive/manifest.json')
    ).json()) as ImageManifest;
    const shared = Object.values(images).find(
      (entry) => entry.share?.url === new URL(image!).pathname,
    );
    const card = await page.locator('main section.grid > a img').first().getAttribute('srcset');
    expect(shared?.variants.map((variant) => variant.url)).toContain(card!.split(' ')[0]);
  });

  test('the about page is the architect’s profile', async ({ page }) => {
    await page.goto('/about/');
    expect(node(await graph(page), 'ProfilePage')).toMatchObject({
      url: `${origin}/about/`,
      mainEntity: { '@id': `${origin}/#person` },
    });
  });

  test('the bare domain previews as the work page and forwards to it', async ({
    page,
    request,
  }) => {
    const [forwarding, work] = await Promise.all([
      served(page, request, '/'),
      served(page, request, '/work/'),
    ]);
    expect(forwarding.refresh).toBe('0; url=/work/');
    expect(forwarding.body).toEqual([{ tag: 'A', href: '/work/' }]);
    expect({ ...forwarding, refresh: undefined, body: undefined }).toEqual({
      ...work,
      refresh: undefined,
      body: undefined,
    });
    expect(work.canonical).toBe(`${origin}/work/`);
  });

  test('the not-found page is kept out of search', async ({ page }) => {
    await page.goto('/404.html');
    await expect(meta(page, 'name="robots"')).toHaveAttribute('content', 'noindex');
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

test('the sitemap lists the pages but not the forwarding or not-found page', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  for (const path of ['/work/', '/about/']) expect(sitemap).toContain(`<loc>${origin}${path}</loc>`);
  for (const path of ['/', '/404/', '/404.html']) {
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

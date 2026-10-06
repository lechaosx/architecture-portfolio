import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parse } from 'yaml';

const site = parse(
  readFileSync('src/content/singletons/site.md', 'utf8').split('---')[1],
);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const box = async (locator: Locator) => (await locator.boundingBox())!;
const bottom = async (locator: Locator) => {
  const { y, height } = await box(locator);
  return y + height;
};

const cardLinks = (page: Page) =>
  page.locator('main .grid > a').evaluateAll((cards) => cards.map((card) => card.getAttribute('href')));

test('the landing page opens with the site description and links to About', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(site.description_en);
  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(site.description_cs);
  await page.getByRole('link', { name: 'O mně →' }).click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test('selected work is the newest projects with images, with a link to all work', async ({
  page,
}) => {
  // tests/e2e/pages/[fixture].astro: four projects with images, three without.
  await page.goto('/e2e/landing/');
  const section = page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'Selected work' }),
  });
  await expect(section.getByRole('heading', { level: 3 })).toHaveText([
    'Grid project',
    'Project 2025',
    'Project 2024',
  ]);
  await section.getByRole('link', { name: 'All work →' }).click();
  await expect(page).toHaveURL(/\/work\/$/);
});

test('the landing page shows the first cards of the work page', async ({ page }) => {
  await page.goto('/work/');
  const work = await cardLinks(page);
  await page.goto('/');
  const landing = await cardLinks(page);
  expect(landing.length).toBe(Math.min(work.length, 3));
  expect(landing).toEqual(work.slice(0, landing.length));
});

test('with no images the landing page starts with the intro', async ({ page }) => {
  await page.goto('/e2e/landing-bare/');
  await expect(page.locator('[data-carousel]')).toHaveCount(0);
  await expect(page.locator('main img')).toHaveCount(await page.locator('main .grid img').count());
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the hero sits closer under the header than a page heading', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/landing-bare/');
    const header = page.locator('body > header');
    const headingGap = (await box(page.locator('main h1:visible'))).y - (await bottom(header));
    for (const fixture of ['landing-single', 'landing']) {
      await page.goto(`/e2e/${fixture}/`);
      const heroGap = (await box(page.locator('main :is([data-carousel], img)').first())).y - (await bottom(header));
      expect(heroGap, `${fixture} at ${width}px`).toBeGreaterThan(0);
      expect(heroGap, `${fixture} at ${width}px`).toBeLessThan(headingGap);
    }
  }
});

test('the About link ends the last line of the intro on wide screens and sits under it on phones', async ({
  page,
}) => {
  await page.goto('/e2e/landing/');
  const intro = page.locator('main h1:visible');
  const link = page.getByRole('link', { name: 'About →' });

  await page.setViewportSize({ width: 1280, height: 900 });
  const lineHeight = await intro.evaluate((h1) => parseFloat(getComputedStyle(h1).lineHeight));
  const [i, l] = await Promise.all([box(intro), box(link)]);
  expect(l.x).toBeGreaterThan(i.x + i.width);
  expect(l.y + l.height / 2).toBeGreaterThan(i.y + i.height - lineHeight);
  expect(l.y + l.height / 2).toBeLessThan(i.y + i.height);

  await page.setViewportSize({ width: 390, height: 844 });
  const [iPhone, lPhone] = await Promise.all([box(intro), box(link)]);
  expect(lPhone.y).toBeGreaterThanOrEqual(iPhone.y + iPhone.height);
  expect(lPhone.x).toBeCloseTo(iPhone.x, 0);
});

test('the link to all work closes the selected-work heading row', async ({ page }) => {
  await page.goto('/e2e/landing/');
  const heading = page.getByRole('heading', { level: 2, name: 'Selected work' });
  const link = page.getByRole('link', { name: 'All work →' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [h, l, grid] = await Promise.all([heading, link, page.locator('main .grid')].map(box));
    expect(l.y + l.height / 2, `${width}px`).toBeGreaterThan(h.y);
    expect(l.y + l.height / 2, `${width}px`).toBeLessThan(h.y + h.height);
    expect(l.x + l.width, `${width}px`).toBeCloseTo(grid.x + grid.width, 0);
  }
});

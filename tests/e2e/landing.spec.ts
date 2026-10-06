import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';

const site = parse(
  readFileSync('src/content/singletons/site.md', 'utf8').split('---')[1],
);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

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

test('selected work is the newest projects with images, then a link to all work', async ({
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

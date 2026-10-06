import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const list = (page: import('@playwright/test').Page) => page.locator('main ul');

test('projects without images are listed below the grid in sort order, with their brief', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  await expect(page.locator('main .grid > a')).toHaveCount(1);

  const rows = list(page).locator('li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Alpha brief');
  await expect(rows.nth(0)).toContainText('2025');
  await expect(rows.nth(0)).toContainText('Prague');
  await expect(rows.nth(0)).toContainText('First line');
  await expect(rows.nth(1)).toContainText('Beta text');
  await expect(rows.nth(2)).toContainText('Old brief');

  const gridBottom = (await page.locator('main .grid').boundingBox())!;
  const listTop = (await list(page).boundingBox())!;
  expect(listTop.y).toBeGreaterThan(gridBottom.y + gridBottom.height);
  await expect(page.locator('main hr')).toHaveCount(1);
});

test('a brief keeps the author line breaks', async ({ page }) => {
  await page.goto('/e2e/work/');
  const brief = list(page).locator('li').first().getByText('First line').first();
  expect(await brief.innerText()).toBe('First line\nSecond line');
});

test('a row links to the project page only when the project has blocks', async ({ page }) => {
  await page.goto('/e2e/work/');
  const rows = list(page).locator('li');
  await expect(rows.nth(0).locator('a')).toHaveCount(0);
  await expect(rows.nth(1).locator('a')).toHaveAttribute('href', '/projects/e2e-text-only/');
  await expect(rows.nth(2).locator('a')).toHaveCount(0);
});

test('neither the rule nor the list render when every project has an image', async ({ page }) => {
  await page.goto('/e2e/work-grid-only/');
  await expect(page.locator('main .grid > a')).toHaveCount(1);
  await expect(list(page)).toHaveCount(0);
  await expect(page.locator('main hr')).toHaveCount(0);
});

test('the brief shows under the title and location, above the blocks, when set', async ({
  page,
}) => {
  await page.goto('/e2e/brief/');
  const brief = page.locator('article').getByText('A brief for the page.').first();
  await expect(brief).toBeVisible();
  expect(await brief.innerText()).toBe('A brief for the page.\nSecond line.');
  const [title, briefBox, block] = await Promise.all([
    page.locator('article h1:visible').boundingBox(),
    brief.boundingBox(),
    page.locator('article [data-lightbox-index="0"]').boundingBox(),
  ]);
  expect(briefBox!.y).toBeGreaterThan(title!.y);
  expect(briefBox!.y).toBeLessThan(block!.y);
});

test('no brief shows on a project page without one', async ({ page }) => {
  await page.goto('/e2e/project/');
  await expect(page.locator('article header p:visible')).toHaveCount(1);
});

test('a text-only project page has no lightbox', async ({ page }) => {
  await page.goto('/e2e/text-only/');
  await expect(page.locator('article .prose:visible')).toHaveCount(1);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('[data-lightbox-index]')).toHaveCount(0);
});

test('hovering a linked row underlines its title, and an unlinked row has no link', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const rows = list(page).locator('li');
  const title = rows.nth(1).getByRole('heading', { name: 'Beta text' });
  const underline = () => title.evaluate((element) => getComputedStyle(element).textDecorationLine);
  expect(await underline()).toBe('none');
  await rows.nth(1).locator('a').hover();
  expect(await underline()).toBe('underline');
  await expect(rows.nth(0).getByRole('link')).toHaveCount(0);

  const unlinkedTitle = rows.nth(0).getByRole('heading', { name: 'Alpha brief' });
  await unlinkedTitle.hover();
  expect(await unlinkedTitle.evaluate((element) => getComputedStyle(element).textDecorationLine)).toBe('none');
});

test('no grid renders when no project has an image', async ({ page }) => {
  await page.goto('/e2e/work-list-only/');
  await expect(page.locator('main .grid')).toHaveCount(0);
  await expect(list(page).locator('li')).toHaveCount(3);
});

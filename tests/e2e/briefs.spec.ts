import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// The fixture work pages in tests/e2e/pages/[fixture].astro: one project with
// an image, then Alpha brief (2025, a two-line brief), Beta text (2025, text
// blocks, so a page) and Old brief (2020, nothing but a title).
const index = (page: Page) => page.locator('main ul');
const rows = (page: Page) => index(page).locator(':scope > li');

test('projects without images form an index under its own heading below the grid, newest first', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  await expect(page.locator('main .grid > a')).toHaveCount(1);

  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText('2025');
  await expect(rows(page).nth(0)).toContainText('Alpha brief');
  await expect(rows(page).nth(0)).toContainText('Prague');
  await expect(rows(page).nth(1)).toContainText('Beta text');
  await expect(rows(page).nth(2)).toContainText('Old brief');

  const heading = page.getByRole('heading', { level: 2, name: 'More projects' });
  const gridBottom = (await page.locator('main .grid:has(> a)').boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  const indexBox = (await index(page).boundingBox())!;
  expect(headingBox.y).toBeGreaterThan(gridBottom.y + gridBottom.height);
  expect(indexBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
});

test('a row with a brief expands in place to show it with the author line breaks', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const row = rows(page).nth(0);
  const brief = row.getByText('First line').filter({ visible: true });
  await expect(row.getByText('First line')).toBeHidden();

  await row.getByText('Alpha brief').click();
  await expect(brief).toBeVisible();
  expect(await brief.innerText()).toBe('First line\nSecond line');
  const title = (await row.getByText('Alpha brief').boundingBox())!;
  const briefBox = (await brief.boundingBox())!;
  expect(briefBox.y).toBeGreaterThan(title.y + title.height);
  expect(briefBox.x).toBeCloseTo(title.x, 0);

  await row.getByText('Alpha brief').click();
  await expect(row.getByText('First line')).toBeHidden();

  // The click left the row focused.
  await page.keyboard.press('Enter');
  await expect(brief).toBeVisible();
});

test('a row whose project has a page links to it, and a bare row does neither', async ({ page }) => {
  await page.goto('/e2e/work/');
  await expect(rows(page).nth(0).getByRole('link')).toHaveCount(0);
  await expect(rows(page).nth(1).getByRole('link')).toHaveAttribute('href', '/projects/e2e-text-only/');
  await expect(rows(page).nth(1).getByText('A text project.')).toHaveCount(0);

  const bare = rows(page).nth(2);
  await expect(bare.getByRole('link')).toHaveCount(0);
  const height = (await bare.boundingBox())!.height;
  await bare.getByText('Old brief').click();
  expect((await bare.boundingBox())!.height).toBeCloseTo(height, 0);
});

test('an expandable or linked row underlines its title on hover, a bare row does not', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const underline = (title: Locator) =>
    title.evaluate((element) => getComputedStyle(element).textDecorationLine);
  for (const [n, name, hovered] of [
    [0, 'Alpha brief', 'underline'],
    [1, 'Beta text', 'underline'],
    [2, 'Old brief', 'none'],
  ] as const) {
    const title = rows(page).nth(n).getByText(name);
    expect(await underline(title), name).toBe('none');
    await title.hover();
    expect(await underline(title), name).toBe(hovered);
  }
});

test('the index lines up in columns on wide screens and stacks the location on phones', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const lefts = (text: string[]) =>
    Promise.all(text.map(async (t, n) => (await rows(page).nth(n).getByText(t).boundingBox())!.x));

  await page.setViewportSize({ width: 1280, height: 900 });
  const years = await lefts(['2025', '2025', '2020']);
  const titles = await lefts(['Alpha brief', 'Beta text', 'Old brief']);
  expect(new Set(years.map(Math.round)).size).toBe(1);
  expect(new Set(titles.map(Math.round)).size).toBe(1);
  const title = (await rows(page).nth(0).getByText('Alpha brief').boundingBox())!;
  const location = (await rows(page).nth(0).getByText('Prague').boundingBox())!;
  expect(location.x).toBeGreaterThan(title.x + title.width);
  expect(Math.abs(location.y + location.height - title.y - title.height)).toBeLessThan(title.height / 2);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const title = (await rows(page).nth(0).getByText('Alpha brief').boundingBox())!;
    const location = (await rows(page).nth(0).getByText('Prague').boundingBox())!;
    expect(location.y, `${width}px`).toBeGreaterThanOrEqual(title.y + title.height);
    expect(location.x, `${width}px`).toBeCloseTo(title.x, 0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px`,
    ).toBe(true);
  }
});

test('neither the index nor its heading render when every project has an image', async ({ page }) => {
  await page.goto('/e2e/work-grid-only/');
  await expect(page.locator('main .grid > a')).toHaveCount(1);
  await expect(index(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'More projects' })).toHaveCount(0);
});

test('without a grid the work heading leads straight into the index', async ({ page }) => {
  await page.goto('/e2e/work-list-only/');
  await expect(page.locator('main .grid > a')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'More projects' })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
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

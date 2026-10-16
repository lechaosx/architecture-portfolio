import { expect, test, type Page } from '@playwright/test';

// The fixture project pages in tests/e2e/pages/[fixture].astro: "between" sits
// between Beta text and Grid project, "first" has only Grid project after it,
// "last" only Beta text before it, and "project" has neither.
const previous = (page: Page) => page.getByRole('link', { name: /Previous/ });
const next = (page: Page) => page.getByRole('link', { name: /Next/ });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('a project page ends with its neighbours on the work page', async ({ page }) => {
  await page.goto('/e2e/between/');
  await expect(previous(page)).toHaveAttribute('href', '/projects/e2e-text-only/');
  await expect(previous(page)).toContainText('Beta text');
  await expect(next(page)).toHaveAttribute('href', '/projects/e2e-grid/');
  await expect(next(page)).toContainText('Grid project');

  const lastImage = (await page.locator('article [data-lightbox-index]').last().boundingBox())!;
  const [p, n] = await Promise.all([previous(page), next(page)].map(async (l) => (await l.boundingBox())!));
  expect(p.y).toBeGreaterThan(lastImage.y + lastImage.height);
  expect(n.x).toBeGreaterThan(p.x + p.width);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(page.getByRole('link', { name: /Předchozí/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Další/ })).toBeVisible();
});

test('at either end of the work page only the neighbour there is offered', async ({ page }) => {
  await page.goto('/e2e/first/');
  await expect(previous(page)).toHaveCount(0);
  await expect(next(page)).toHaveAttribute('href', '/projects/e2e-grid/');

  await page.goto('/e2e/last/');
  await expect(next(page)).toHaveCount(0);
  await expect(previous(page)).toHaveAttribute('href', '/projects/e2e-text-only/');

  await page.goto('/e2e/project/');
  await expect(previous(page)).toHaveCount(0);
  await expect(next(page)).toHaveCount(0);
});

test('the neighbour links fit small phones', async ({ page }) => {
  await page.goto('/e2e/between/');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const [p, n] = await Promise.all([previous(page), next(page)].map(async (l) => (await l.boundingBox())!));
    expect(n.x, `${width}px`).toBeGreaterThanOrEqual(p.x + p.width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px`,
    ).toBe(true);
  }
});

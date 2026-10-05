import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const alts = (page: Page) =>
  page.locator('[data-lightbox-index] img').evaluateAll((images) =>
    images.map((image) => image.getAttribute('alt')),
  );

test.describe(() => {
  test.use({ javaScriptEnabled: false });

  test('project images are described by their Czech titles as served, untitled ones by nothing', async ({
    page,
  }) => {
    await page.goto('/e2e/titled-sets/');
    expect(await alts(page)).toEqual(['Půdorys', 'Řez', '']);
    await page.goto('/e2e/project/');
    expect((await alts(page)).slice(0, 3)).toEqual([
      '',
      'Dlaždicová varianta 2',
      'Dlaždicová varianta 3',
    ]);
  });
});

test.describe(() => {
  test.use({ locale: 'cs-CZ' });

  test('image descriptions follow the language switch', async ({ page }) => {
    await page.goto('/e2e/titled-sets/');
    expect(await alts(page)).toEqual(['Půdorys', 'Řez', '']);
    await page.getByRole('button', { name: 'Přepnout do angličtiny' }).click();
    expect(await alts(page)).toEqual(['Plan', 'Section', '']);
  });
});

test.describe(() => {
  test.use({ locale: 'en-US' });

  test('the lightbox image is described by its title in the current language', async ({ page }) => {
    await page.goto('/e2e/project/');
    expect((await alts(page)).slice(0, 2)).toEqual(['', 'Tiled variant 2']);
    await page.locator('[data-lightbox-index="1"]').click();
    const lightbox = page.getByRole('dialog');
    await expect(lightbox.getByRole('img', { name: 'Tiled variant 2' })).toBeVisible();
    await lightbox.getByRole('button', { name: 'Switch to Czech' }).click();
    await expect(lightbox.getByRole('img', { name: 'Dlaždicová varianta 2' })).toBeVisible();
  });
});

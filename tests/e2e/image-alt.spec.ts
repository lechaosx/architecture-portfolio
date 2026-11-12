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

  test('project images are described by their Czech titles in their project as served, untitled ones by nothing', async ({
    page,
  }) => {
    await page.goto('/cs/e2e/titled-sets/');
    expect(await alts(page)).toEqual(['Půdorys – Testovací projekt, Nikde', 'Řez – Testovací projekt, Nikde', '']);
    await page.goto('/cs/e2e/project/');
    expect((await alts(page)).slice(0, 3)).toEqual([
      '',
      'Dlaždicová varianta 2 – Testovací projekt, Nikde',
      'Dlaždicová varianta 3 – Testovací projekt, Nikde',
    ]);
  });
});

test.describe(() => {
  test.use({ locale: 'cs-CZ' });

  test('image descriptions follow the language switch', async ({ page }) => {
    await page.goto('/e2e/titled-sets/');
    expect(await alts(page)).toEqual(['Půdorys – Testovací projekt, Nikde', 'Řez – Testovací projekt, Nikde', '']);
    await page.getByRole('link', { name: 'Přepnout do angličtiny' }).click();
    expect(await alts(page)).toEqual(['Plan – Test project, Nowhere', 'Section – Test project, Nowhere', '']);
  });

  test('an image button is named by its position and title alone, in the current language', async ({ page }) => {
    await page.goto('/e2e/project/');
    const buttons = page.locator('[data-lightbox-index]');
    await expect(buttons.nth(0)).toHaveAccessibleName('Otevřít obrázek 1');
    await expect(buttons.nth(1)).toHaveAccessibleName('Otevřít obrázek 2: Dlaždicová varianta 2');
    await page.getByRole('link', { name: 'Přepnout do angličtiny' }).click();
    await expect(buttons.nth(0)).toHaveAccessibleName('Open image 1');
    await expect(buttons.nth(1)).toHaveAccessibleName('Open image 2: Tiled variant 2');
    expect((await alts(page)).slice(0, 2)).toEqual(['', 'Tiled variant 2 – Test project, Nowhere']);
  });
});

test.describe(() => {
  test.use({ locale: 'en-US' });

  test('the lightbox image is described by its title in its project in the current language', async ({ page }) => {
    await page.goto('/e2e/project/');
    expect((await alts(page)).slice(0, 2)).toEqual(['', 'Tiled variant 2 – Test project, Nowhere']);
    await page.locator('[data-lightbox-index="1"]').click();
    const lightbox = page.getByRole('dialog');
    await expect(lightbox.getByRole('img', { name: 'Tiled variant 2 – Test project, Nowhere', exact: true })).toBeVisible();
    await lightbox.getByRole('link', { name: 'Switch to Czech' }).click();
    await expect(lightbox.getByRole('img', { name: 'Dlaždicová varianta 2 – Testovací projekt, Nikde', exact: true })).toBeVisible();
  });
});

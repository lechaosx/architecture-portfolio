import { expect, test } from '@playwright/test';

test('neutral pages use saved preference then the first supported browser language, preserving URL state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['de-DE', 'cs-CZ', 'en-US'] });
    localStorage.setItem('lang', 'invalid');
  });
  await page.goto('/about/?view=plan#contact');
  await expect(page).toHaveURL('/cs/about/?view=plan#contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
});

test('an explicit language wins storage and browser, and footer links navigate, remember and support Back', async ({ page }) => {
  await page.goto('/en/');
  await page.evaluate(() => localStorage.setItem('lang', 'cs'));
  await page.goto('/en/about/?view=plan#contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const switcher = page.locator('footer a[data-lang-toggle]');
  await expect(switcher).toHaveAttribute('href', '/cs/about/?view=plan#contact');
  await switcher.click();
  await expect(page).toHaveURL('/cs/about/?view=plan#contact');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('cs');
  await page.goBack();
  await expect(page).toHaveURL('/en/about/?view=plan#contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('header a[href="/en/work/"]')).toHaveCount(1);
  await page.goto('/cs/about/');
  await page.locator('footer a[data-lang-toggle]').click();
  await expect(page).toHaveURL('/en/about/');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');
  await page.goto('/work/');
  await expect(page).toHaveURL('/en/work/');
});

test('language links in the viewer keep the selected image', async ({ page }) => {
  await page.goto('/en/e2e/project/#image-3');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-lang-toggle]').click();
  await expect(page).toHaveURL('/cs/e2e/project/#image-3');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test.describe('static localized output', () => {
  test.use({ javaScriptEnabled: false });
  test('neutral pages offer English content and a translated footer link without JavaScript', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('main .prose[lang="en"]')).toBeVisible();
    await page.locator('footer [data-lang-toggle]').click();
    await expect(page).toHaveURL('/cs/about/');
  });
  for (const lang of ['cs', 'en']) test(`${lang} content, metadata and footer work without JavaScript`, async ({ page }) => {
    await page.goto(`/${lang}/about/`);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page).toHaveTitle(lang === 'cs' ? /^O mně \|/ : /^About \|/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', lang === 'cs' ? 'cs_CZ' : 'en_US');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', (await page.title()));
    await expect(page.locator(`main .prose[lang="${lang}"]`)).toBeVisible();
    await expect(page.locator(`main .prose[lang="${lang === 'cs' ? 'en' : 'cs'}"]`)).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://kalabkova.cz/${lang}/about/`);
    for (const other of ['cs', 'en']) await expect(page.locator(`link[hreflang="${other}"]`))
      .toHaveAttribute('href', `https://kalabkova.cz/${other}/about/`);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', 'https://kalabkova.cz/about/');
    await page.locator('footer [data-lang-toggle]').click();
    await expect(page).toHaveURL(`/${lang === 'cs' ? 'en' : 'cs'}/about/`);
  });
});

test('unknown routes preserve 404 status and select language without redirect loops', async ({ page }) => {
  const response = await page.goto('/cs/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL('/cs/no-such-page/');
  await expect(page.getByRole('heading', { name: 'Na této parcele nic nestojí.' })).toBeVisible();
  const link = page.locator('footer [data-lang-toggle]');
  await expect(link).toHaveAttribute('href', '/en/no-such-page/');
  await expect(link).toHaveAttribute('hreflang', 'en');
  await link.click();
  await expect(page).toHaveURL('/en/no-such-page/');
  await expect(page.getByRole('heading', { name: 'Nothing stands on this plot.' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('lang', 'cs'));
  const neutral = await page.goto('/another-missing-page/');
  expect(neutral?.status()).toBe(404);
  await expect(page).toHaveURL('/another-missing-page/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.locator('main a')).toHaveAttribute('href', '/cs/');
});

test('neutral unicode project URLs retain search and image anchors with unavailable storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['sk-SK', 'cs-CZ', 'en'] });
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
  });
  await page.goto('/projects/křížovice/?view=plan#image-2');
  await expect(page).toHaveURL('/cs/projects/k%C5%99%C3%AD%C5%BEovice/?view=plan#image-2');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('English fallback and middle-click use canonical content links', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', { value: ['de', 'fr'] }));
  await page.goto('/');
  await expect(page).toHaveURL('/en/');
  const opened = context.waitForEvent('page');
  await page.locator('footer [data-lang-toggle]').click({ button: 'middle' });
  const translated = await opened;
  await translated.waitForLoadState();
  await expect(translated).toHaveURL('/cs/');
  await expect(translated.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page).toHaveURL('/en/');
});

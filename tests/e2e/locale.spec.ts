import { expect, test } from '@playwright/test';

for (const keyboard of [false, true]) test(`language switching preserves the document, footer position and focus (${keyboard ? 'keyboard' : 'pointer'})`, async ({ page }) => {
  await page.goto('/en/e2e/language-height/?view=plan#contact');
  const switcher = page.locator('footer [data-lang-toggle]');
  await switcher.scrollIntoViewIfNeeded();
  await switcher.focus();
  const original = await switcher.elementHandle();
  const before = (await switcher.boundingBox())!;
  const height = await page.locator('main').evaluate((element) => element.clientHeight);
  if (keyboard) await page.keyboard.press('Enter');
  else await switcher.click();
  await expect(page).toHaveURL('/cs/e2e/language-height/?view=plan#contact');
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(switcher).toBeFocused();
  await expect.poll(async () => (await switcher.boundingBox())!.y).toBeCloseTo(before.y, 0);
  expect(await page.locator('main').evaluate((element) => element.clientHeight)).toBeLessThan(height - 500);
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await page.goForward();
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(switcher).toHaveAttribute('href', '/en/e2e/language-height/?view=plan#contact');
  await switcher.scrollIntoViewIfNeeded();
  const reverse = (await switcher.boundingBox())!;
  if (keyboard) await page.keyboard.press('Enter');
  else await switcher.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect.poll(async () => (await switcher.boundingBox())!.y).toBeCloseTo(reverse.y, 0);
});

test('language switching keeps the mounted viewer, zoom, pan, description and one viewer history entry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/e2e/about/');
  await page.goto('/en/e2e/project/?view=plan');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('[data-lightbox-index="2"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const original = await dialog.elementHandle();
  const drawing = page.locator('.lightbox-slide-current .lightbox-front > img');
  await expect(drawing).toBeVisible();
  await page.keyboard.press('+');
  await expect.poll(() => drawing.evaluate((image) => getComputedStyle(image).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  const stage = (await page.locator('.lightbox-stage').boundingBox())!;
  await page.mouse.move(stage.width / 2, stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.width / 2 + 50, stage.height / 2 + 30);
  await page.mouse.up();
  const transform = await drawing.evaluate((image) => getComputedStyle(image).transform);
  const originalDrawing = await drawing.elementHandle();
  await dialog.locator('[data-lang-toggle]').click();
  await expect(page).toHaveURL('/cs/e2e/project/?view=plan#image-3');
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await originalDrawing!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(drawing).toHaveCSS('transform', transform);
  await dialog.getByRole('button', { name: 'Zobrazit popis' }).click();
  await expect(dialog.getByRole('region', { name: 'Dlaždicová varianta 3' })).toBeVisible();
  await dialog.locator('[data-lang-toggle]').click();
  await expect(page).toHaveURL('/en/e2e/project/?view=plan#image-3');
  await expect(dialog.getByRole('button', { name: 'Show description' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('region', { name: 'Tiled variant 3' })).toBeVisible();
  await dialog.locator('[data-lang-toggle]').click();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL('/cs/e2e/project/?view=plan');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await page.goForward();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('/cs/e2e/project/?view=plan#image-3');
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL('/en/e2e/about/');
});

for (const path of ['/e2e/landing/', '/e2e/about/', '/e2e/work/', '/e2e/project/']) test(`in-place translations match the static metadata, text, links and image descriptions for ${path}`, async ({ page }) => {
  await page.goto(`/en${path}`);
  await page.evaluate(() => history.replaceState({ applicationValue: 42 }, ''));
  const other = await (await page.request.get(`/cs${path}`)).text();
  await page.locator('footer [data-lang-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  const comparison = await page.evaluate((html) => {
    const expected = new DOMParser().parseFromString(html, 'text/html');
    const snapshot = (doc: Document) => ({
      title: doc.title,
      meta: Array.from(doc.querySelectorAll('head meta[name], head meta[property]')).map((node) => [node.getAttribute('name') ?? node.getAttribute('property'), node.getAttribute('content')]),
      links: Array.from(doc.querySelectorAll('head link[rel="canonical"], head link[rel="alternate"]')).map((node) => [node.getAttribute('hreflang'), node.getAttribute('href')]),
      graph: JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!),
      images: Array.from(doc.querySelectorAll('main img:not(astro-island img)')).map((node) => [node.getAttribute('src'), node.getAttribute('alt')]),
      text: doc.querySelector('main')!.textContent!.replace(/\s+/g, ' ').trim(),
      navigation: Array.from(doc.querySelectorAll<HTMLAnchorElement>('main a[href], header a[href]')).map((node) => new URL(node.getAttribute('href')!, location.origin).href),
    });
    return { current: snapshot(document), expected: snapshot(expected), state: history.state };
  }, other);
  expect(comparison.current).toEqual(comparison.expected);
  expect(comparison.state).toEqual({ applicationValue: 42 });
});

for (const viewer of [false, true]) test(`rapid language clicks use the latest input without document navigation (${viewer ? 'viewer' : 'footer'})`, async ({ page }) => {
  await page.goto(viewer ? '/en/e2e/project/#image-3' : '/en/e2e/about/');
  const selector = `${viewer ? 'dialog' : 'footer'} [data-lang-toggle]`;
  await expect(page.locator(selector)).toBeVisible();
  const original = await page.locator(selector).elementHandle();
  await page.evaluate((selector) => {
    const switcher = document.querySelector<HTMLAnchorElement>(selector)!;
    for (let count = 0; count < 2; count += 1) switcher.click();
  }, selector);
  await expect(page).toHaveURL(viewer ? '/en/e2e/project/#image-3' : '/en/e2e/about/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
});

test('neutral pages use saved preference then the first supported browser language, preserving URL state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['de-DE', 'cs-CZ', 'en-US'] });
    localStorage.setItem('lang', 'invalid');
  });
  await page.goto('/e2e/about/?view=plan#contact');
  await expect(page).toHaveURL('/cs/e2e/about/?view=plan#contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
});

test('an explicit language wins storage and browser, and footer links navigate, remember and support Back', async ({ page }) => {
  await page.goto('/en/e2e/landing/');
  await page.evaluate(() => localStorage.setItem('lang', 'cs'));
  await page.goto('/en/e2e/about/?view=plan#contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const switcher = page.locator('footer a[data-lang-toggle]');
  await expect(switcher).toHaveAttribute('href', '/cs/e2e/about/?view=plan#contact');
  await switcher.click();
  await expect(page).toHaveURL('/cs/e2e/about/?view=plan#contact');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('cs');
  await page.goBack();
  await expect(page).toHaveURL('/en/e2e/about/?view=plan#contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('header a[href="/en/work/"]')).toHaveCount(1);
  await page.goto('/cs/e2e/about/');
  await page.locator('footer a[data-lang-toggle]').click();
  await expect(page).toHaveURL('/en/e2e/about/');
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');
  await page.goto('/e2e/work/');
  await expect(page).toHaveURL('/en/e2e/work/');
});

test.describe('static localized output', () => {
  test.use({ javaScriptEnabled: false });
  test('neutral pages offer English content and a translated footer link without JavaScript', async ({ page }) => {
    await page.goto('/e2e/about/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('main .prose[lang="en"]')).toBeVisible();
    await page.locator('footer [data-lang-toggle]').click();
    await expect(page).toHaveURL('/cs/e2e/about/');
  });
  for (const lang of ['cs', 'en']) test(`${lang} content, metadata and footer work without JavaScript`, async ({ page }) => {
    await page.goto(`/${lang}/e2e/about/`);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page).toHaveTitle(lang === 'cs' ? /^O mně \|/ : /^About \|/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', lang === 'cs' ? 'cs_CZ' : 'en_US');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', (await page.title()));
    await expect(page.locator(`main .prose[lang="${lang}"]`)).toBeVisible();
    await expect(page.locator(`main .prose[lang="${lang === 'cs' ? 'en' : 'cs'}"]`)).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://kalabkova.cz/${lang}/e2e/about/`);
    for (const other of ['cs', 'en']) await expect(page.locator(`link[hreflang="${other}"]`))
      .toHaveAttribute('href', `https://kalabkova.cz/${other}/e2e/about/`);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', 'https://kalabkova.cz/e2e/about/');
    await page.locator('footer [data-lang-toggle]').click();
    await expect(page).toHaveURL(`/${lang === 'cs' ? 'en' : 'cs'}/e2e/about/`);
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
  await page.goto('/e2e/náměstí/?view=plan#image-1');
  await expect(page).toHaveURL('/cs/e2e/n%C3%A1m%C4%9Bst%C3%AD/?view=plan#image-1');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('English fallback and middle-click use canonical content links', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', { value: ['de', 'fr'] }));
  await page.goto('/e2e/landing/');
  await expect(page).toHaveURL('/en/e2e/landing/');
  const opened = context.waitForEvent('page');
  await page.locator('footer [data-lang-toggle]').click({ button: 'middle' });
  const translated = await opened;
  await translated.waitForLoadState();
  await expect(translated).toHaveURL('/cs/e2e/landing/');
  await expect(translated.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page).toHaveURL('/en/e2e/landing/');
});

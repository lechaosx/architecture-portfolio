import { expect, test, type Locator } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
});

const columns = (prose: Locator) => prose.evaluate((element) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const starts = new Set<number>();
  while (walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.width > 10) starts.add(Math.round(rect.left));
    }
  }
  return starts.size;
});

test('149 visible Markdown words remain full width; 150 split only with room for two readable columns', async ({ page }) => {
  await page.goto('/e2e/prose-length/');
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1280, 800, 700, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const prose = page.locator('article .prose:visible');
    const widthOfPage = (await page.locator('article header').boundingBox())!.width;
    for (const index of [0, 2]) {
      expect((await prose.nth(index).boundingBox())!.width).toBeCloseTo(widthOfPage, 0);
      expect(await columns(prose.nth(index)), `${width}px, block ${index}`).toBe(1);
    }
    expect(await columns(prose.nth(1)), `${width}px`).toBe(width >= 800 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('brief length is measured per language and facts remain underneath both layouts', async ({ page }) => {
  await page.goto('/e2e/brief-length/');
  await page.evaluate(() => document.fonts.ready);
  for (const language of ['en', 'cs']) {
    if (language === 'cs') await page.locator('[data-lang-toggle]').click();
    for (const width of [1280, 800, 700, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const brief = page.locator('article header .running-text:visible');
      expect(await columns(brief), `${language} ${width}px`).toBe(language === 'en' && width >= 800 ? 2 : 1);
      const [briefBox, facts, title] = await Promise.all([
        brief.boundingBox(), page.locator('article header dl').boundingBox(), page.locator('article h1:visible').boundingBox(),
      ]);
      expect(briefBox!.width).toBeCloseTo(title!.width, 0);
      expect(facts!.width).toBeCloseTo(title!.width, 0);
      expect(facts!.y).toBeGreaterThan(briefBox!.y + briefBox!.height);
    }
  }
});

test('plain-text paragraphs count as one block without losing their paragraph boundaries', async ({ page }) => {
  await page.goto('/e2e/paragraphs-length/');
  await page.evaluate(() => document.fonts.ready);
  for (const language of ['en', 'cs']) {
    if (language === 'cs') await page.locator('[data-lang-toggle]').click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const prose = page.locator('main .running-text:visible');
      await expect(prose.locator('p')).toHaveCount(2);
      expect(await columns(prose), `${language} ${width}px`).toBe(language === 'en' && width === 1280 ? 2 : 1);
    }
  }
});

test('switching between one- and two-column translations keeps the language button anchored', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/e2e/brief-length/');
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.overflowAnchor = 'none';
    document.body.style.paddingBottom = '600px';
  });
  const button = page.locator('[data-lang-toggle]');
  for (const keyboard of [false, true]) {
    await button.evaluate((element) => scrollTo(0, scrollY + element.getBoundingClientRect().y - 350));
    await button.focus();
    const before = (await button.boundingBox())!.y;
    if (keyboard) await page.keyboard.press('Enter');
    else await button.click();
    await expect(page.locator('html')).toHaveAttribute('lang', keyboard ? 'en' : 'cs');
    await expect.poll(async () => Math.abs((await button.boundingBox())!.y - before)).toBeLessThanOrEqual(1);
  }
});

import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// The fixture work pages in tests/e2e/pages/[fixture].astro: one project with
// an image, then Alpha brief (2025, a two-line brief), Beta text (2025, text
// blocks, so a page) and Old brief (12/2019–12/2020, nothing but a title).
const index = (page: Page) => page.locator('main ul');
const rows = (page: Page) => index(page).locator(':scope > li');
const gapUnderHeader = async (page: Page, content: Locator) => {
  const header = (await page.locator('body > header').boundingBox())!;
  return (await content.boundingBox())!.y - header.y - header.height;
};

test('the work page opens with the grid, as the landing page with its images, under a title only for screen readers', async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/landing/');
    const heroGap = await gapUnderHeader(page, page.locator('main [data-carousel]'));
    await page.goto('/e2e/work/');
    const gridGap = await gapUnderHeader(page, page.locator('main .grid > a').first());
    expect(gridGap, `${width}px`).toBeCloseTo(heroGap, 0);
  }
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText('Work');
});

test('projects without images follow the grid as an index with no heading of its own, newest first', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  await expect(page.locator('main .grid > a')).toHaveCount(1);
  await expect(page.locator('main').getByRole('heading')).toHaveText([
    'Work',
    'Grid project',
    'Alpha brief',
    'Beta text',
    'Old brief',
  ]);

  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText('2025');
  await expect(rows(page).nth(0)).toContainText('Alpha brief');
  await expect(rows(page).nth(0)).toContainText('Prague');
  await expect(rows(page).nth(1)).toContainText('Beta text');
  await expect(rows(page).nth(2)).toContainText('Old brief');

  const gridBottom = (await page.locator('main .grid:has(> a)').boundingBox())!;
  const indexBox = (await index(page).boundingBox())!;
  expect(indexBox.y).toBeGreaterThan(gridBottom.y + gridBottom.height);
});

test('a card shows its period, an ongoing one running until now in the visitor’s language', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const card = page.locator('main .grid > a').first();
  await expect(card.getByText('2025–present')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(card.getByText('2025–dosud')).toBeVisible();
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

test('an opened brief stays in the title column at every screen size', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const row = rows(page).nth(0);
  await row.getByText('Alpha brief').click();
  const brief = row.getByText('First line').filter({ visible: true });
  for (const width of [1280, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [briefBox, title] = await Promise.all([
      brief.boundingBox(),
      row.getByText('Alpha brief').boundingBox(),
    ]);
    expect(briefBox!.x, `${width}px`).toBeCloseTo(title!.x, 0);
    expect(briefBox!.width, `${width}px`).toBeCloseTo(title!.width, 0);
  }
});

test('an author line break in a brief ends its line short', async ({ page }) => {
  await page.goto('/e2e/work/');
  const row = rows(page).nth(0);
  await row.getByText('Alpha brief').click();
  const [firstLine, width] = await row
    .getByText('First line')
    .filter({ visible: true })
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return [range.getClientRects()[0].width, element.clientWidth];
    });
  expect(firstLine).toBeLessThan(width / 2);
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

test('the index aligns columns on wide screens and stacks period, title and location on phones', async ({
  page,
}) => {
  await page.goto('/e2e/work/');
  const lefts = (text: string[]) =>
    Promise.all(
      text.map(async (t, n) => (await rows(page).nth(n).getByText(t).filter({ visible: true }).boundingBox())!.x),
    );

  await page.setViewportSize({ width: 1280, height: 900 });
  const periods = await lefts(['2025', '2025', '12/2019–12/2020']);
  const titles = await lefts(['Alpha brief', 'Beta text', 'Old brief']);
  expect(new Set(periods.map(Math.round)).size).toBe(1);
  expect(new Set(titles.map(Math.round)).size).toBe(1);
  const title = (await rows(page).nth(0).getByText('Alpha brief').boundingBox())!;
  const location = (await rows(page).nth(0).getByText('Prague').boundingBox())!;
  expect(location.x).toBeGreaterThan(title.x + title.width);
  expect(Math.abs(location.y + location.height - title.y - title.height)).toBeLessThan(title.height / 2);

  const period = (n: number, text: string) => rows(page).nth(n).getByText(text).filter({ visible: true });
  const gapUnderTitle = async (n: number, title: string) => {
    const titleBox = (await rows(page).nth(n).getByText(title).boundingBox())!;
    return (await rows(page).nth(n).getByText('Nowhere').boundingBox())!.y - titleBox.y - titleBox.height;
  };
  for (const width of [1280, 640, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const longest = (await period(2, '12/2019–12/2020').boundingBox())!;
    const oldTitle = (await rows(page).nth(2).getByText('Old brief').boundingBox())!;
    if (width >= 640) {
      expect(longest.x + longest.width, `${width}px`).toBeLessThan(oldTitle.x);
      expect(longest.height).toBeCloseTo((await period(1, '2025').boundingBox())!.height, 0);
    } else {
      expect(longest.y + longest.height, `${width}px`).toBeLessThanOrEqual(oldTitle.y);
      expect(longest.x, `${width}px`).toBeCloseTo(oldTitle.x, 0);
      expect(await gapUnderTitle(2, 'Old brief'), `${width}px`).toBeCloseTo(await gapUnderTitle(1, 'Beta text'), 0);
    }
  }

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

test('no index renders when every project has an image', async ({ page }) => {
  await page.goto('/e2e/work-grid-only/');
  await expect(page.locator('main .grid > a')).toHaveCount(1);
  await expect(index(page)).toHaveCount(0);
});

test('without a grid the index opens the page, as the identity line does without images', async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/landing-bare/');
    const lineGap = await gapUnderHeader(page, page.locator('main h1:visible'));
    await page.goto('/e2e/work-list-only/');
    expect(await gapUnderHeader(page, index(page)), `${width}px`).toBeCloseTo(lineGap, 0);
  }
  await expect(page.locator('main .grid > a')).toHaveCount(0);
  await expect(page.locator('main').getByRole('heading')).toHaveText(['Work', 'Alpha brief', 'Beta text', 'Old brief']);
  await expect(rows(page)).toHaveCount(3);
});

test('the brief shows under the title, above the blocks, when set', async ({
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

test('a text-only project page has no lightbox', async ({ page }) => {
  await page.goto('/e2e/text-only/');
  await expect(page.locator('article .prose:visible')).toHaveCount(1);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('[data-lightbox-index]')).toHaveCount(0);
});


test('expanded contribution shares the title column and keeps readable text columns', async ({ page }) => {
  await page.goto('/e2e/work-readable/');
  const row = page.locator('main > div > ul > li').first();
  await row.locator('summary').click();
  for (const language of ['en', 'cs']) {
    if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    for (const width of [1440, 1280, 800, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const title = await row.locator('h2:visible').boundingBox();
      const content = row.locator('details > div > div');
      const contentBox = await content.boundingBox();
      expect(contentBox!.x, `${language} ${width}px`).toBeCloseTo(title!.x, 0);
      expect(contentBox!.width, `${language} ${width}px`).toBeCloseTo(title!.width, 0);
      const metrics = await content.locator('p:visible').evaluate((element) => {
        const style = getComputedStyle(element);
        const ruler = document.createElement('span');
        ruler.style.cssText = `display:block;width:1ch;font:${style.font}`;
        element.append(ruler);
        const ch = ruler.getBoundingClientRect().width;
        ruler.remove();
        return { width: element.getBoundingClientRect().width, column: parseFloat(style.columnWidth), gap: parseFloat(style.columnGap), ch };
      });
      expect(Number.isFinite(metrics.column), `${language} ${width}px`).toBe(true);
      const count = Math.min(2, Math.max(1, Math.floor((metrics.width + metrics.gap) / (metrics.column + metrics.gap))));
      const actualColumn = (metrics.width - metrics.gap * (count - 1)) / count;
      expect(actualColumn / metrics.ch, `${language} ${width}px`).toBeLessThanOrEqual(75);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  }
});


test('expanded real project credits fit every screen without breaking names', async ({ page }) => {
  for (const width of [1280, 800, 390, 320]) {
    for (const language of ['en', 'cs']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/');
      if (await page.locator('html').getAttribute('data-lang') !== language) await page.locator('[data-lang-toggle]').click();
      await page.locator('details').evaluateAll((rows) => rows.forEach((row) => row.setAttribute('open', '')));
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${language} ${width}px`).toBe(width);
    }
  }
});

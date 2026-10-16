import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';

const site = parse(
  readFileSync('src/content/singletons/site.md', 'utf8').split('---')[1],
);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const visibleText = { useInnerText: true };
const section = (page: Page, heading: string | RegExp) =>
  page.locator('main section', {
    has: page.getByRole('heading', { level: 2, name: heading, exact: true }),
  });
const box = async (page: Page, text: string) =>
  (await page.locator('main').getByText(text, { exact: true }).filter({ visible: true }).boundingBox())!;

test('her name is the page title and opens the page, as the identity line does on the landing page', async ({
  page,
}) => {
  const gapUnderHeader = async () => {
    const header = (await page.locator('body > header').boundingBox())!;
    return (await page.locator('main h1:visible').boundingBox())!.y - header.y - header.height;
  };
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/landing-bare/');
    const lineGap = await gapUnderHeader();
    await page.goto('/e2e/about/');
    expect(await gapUnderHeader(), `${width}px`).toBeCloseTo(lineGap, 0);
  }
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(site.name);
});

test('the name and bio sit beside the portrait on wide screens, above it on phones', async ({
  page,
}) => {
  await page.goto('/e2e/about/');
  const portrait = page.locator('main img').first();
  const bio = page.locator('main .prose:visible');

  await page.setViewportSize({ width: 1280, height: 900 });
  const [b, p] = await Promise.all([bio, portrait].map(async (l) => (await l.boundingBox())!));
  expect(p.x).toBeGreaterThan(b.x + b.width);
  expect(p.width).toBeCloseTo(b.width, 0);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const [bPhone, pPhone] = await Promise.all([bio, portrait].map(async (l) => (await l.boundingBox())!));
    expect(pPhone.x, `${width}px`).toBeCloseTo(bPhone.x);
    expect(pPhone.y, `${width}px`).toBeGreaterThan(bPhone.y + bPhone.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px`,
    ).toBe(true);
  }
});

test('Approach comes before the facts, whose rows keep their order', async ({ page }) => {
  await page.goto('/e2e/about/');
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText([
    'Approach',
    'Services',
    'Experience',
    'Education',
    'Awards',
  ]);
  await expect(section(page, 'Experience').getByRole('listitem')).toHaveText(
    [/^2024–present\s*Architect, Studio A, Brno/, /^2022–2024\s*Intern, Studio B, Prague$/],
    visibleText,
  );
  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(section(page, 'Praxe').getByRole('listitem').first()).toHaveText(/^2024–dosud\s*Architektka/, visibleText);
});

test('a fact row reads its period, then title and place, with the department under them', async ({
  page,
}) => {
  await page.goto('/e2e/about/');
  for (const width of [1280, 768, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const longest = await box(page, '12/2024–12/2026');
    expect(longest.x + longest.width, `${width}px`).toBeLessThan((await box(page, 'Architecture and Urban Development')).x);
    if (width >= 640) expect(longest.height, `${width}px`).toBeCloseTo((await box(page, '2022–2024')).height, 0);
    const period = await box(page, '2024–present');
    const title = await box(page, 'Architect');
    const department = await box(page, 'Housing team');
    expect(period.x + period.width, `${width}px`).toBeLessThan(title.x);
    expect(Math.abs(period.y + period.height - (title.y + title.height)), `${width}px`).toBeLessThan(4);
    expect(department.y, `${width}px`).toBeGreaterThanOrEqual(title.y + title.height);
    expect(department.x, `${width}px`).toBeCloseTo(title.x, 0);
  }
});

test('a fact description keeps the author’s paragraphs in both languages', async ({ page }) => {
  await page.goto('/e2e/about/');
  const row = (title: string) =>
    section(page, /^(Experience|Praxe)$/).getByRole('listitem').filter({ hasText: title }).first();
  await expect(row('Architect').getByRole('paragraph').filter({ visible: true })).toHaveText([
    'Architect, Studio A, Brno',
    'Housing team',
    /^The drawing/,
    'Permit drawings.',
  ], visibleText);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(row('Architektka').getByRole('paragraph').filter({ visible: true })).toHaveText([
    'Architektka, Ateliér A, Brno',
    'Tým bydlení',
    /^Výkres/,
    'Výkresy k povolení.',
  ], visibleText);
});

test('services are a plain list in the visitor’s language', async ({ page }) => {
  await page.goto('/e2e/about/');
  await expect(section(page, 'Services').getByRole('listitem')).toHaveText(
    ['Family houses', 'Renovations', 'Interiors'],
    visibleText,
  );
  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(section(page, 'Služby').getByRole('listitem')).toHaveText(
    ['Rodinné domy', 'Rekonstrukce', 'Interiéry'],
    visibleText,
  );
});

test('with nothing optional filled, only the name and bio remain', async ({ page }) => {
  await page.goto('/e2e/about-bare/');
  await expect(page.locator('main').getByRole('heading')).toHaveText([site.name]);
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.locator('main .prose:visible')).toBeVisible();
});

test('Approach is two columns on wide screens and one on phones', async ({ page }) => {
  await page.goto('/e2e/about/');
  const items = section(page, 'Approach').getByRole('listitem');
  const boxes = async () =>
    (await Promise.all((await items.all()).map((item) => item.boundingBox()))).map((box) => box!);

  await page.setViewportSize({ width: 1280, height: 900 });
  const [first, second, third, fourth] = await boxes();
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(second.y).toBeCloseTo(first.y);
  expect(third.x).toBeCloseTo(first.x);
  expect(third.y).toBeGreaterThan(first.y);
  expect(fourth.x).toBeCloseTo(second.x);

  await page.setViewportSize({ width: 390, height: 800 });
  const phone = await boxes();
  for (const [index, box] of phone.entries()) {
    expect(box.x, `item ${index + 1}`).toBeCloseTo(phone[0].x);
    if (index > 0) expect(box.y, `item ${index + 1}`).toBeGreaterThan(phone[index - 1].y);
  }
});

test('Approach items stay still on hover, since they are not links', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/e2e/about/');
  const item = section(page, 'Approach').getByRole('listitem').first();
  const look = () =>
    item.evaluate((root) =>
      [root, ...root.querySelectorAll('*')].map((element) => {
        for (const animation of element.getAnimations()) animation.finish();
        const style = getComputedStyle(element);
        return [style.transform, style.scale, style.translate, style.color, style.opacity];
      }),
    );
  await item.scrollIntoViewIfNeeded();
  await expect(item).not.toHaveClass(/is-hidden/);
  await page.mouse.move(0, 0);
  const atRest = await look();
  await item.hover();
  expect(await look()).toEqual(atRest);
});

test('the bio splits into columns only where each keeps a comfortable width', async ({
  page,
}) => {
  for (const path of ['/e2e/about/', '/e2e/about-bare/']) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const bio = page.locator('main .prose:visible');

    for (const width of [390, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await bio.evaluate((element) => {
        const measure = document.createElement('div');
        measure.style.cssText = 'position:absolute; width:35ch; visibility:hidden';
        element.append(measure);
        const minimumColumnWidth = measure.getBoundingClientRect().width;
        measure.remove();
        const columns = Array.from(element.querySelector('p')!.getClientRects());
        return {
          fits:
            element.getBoundingClientRect().width >=
            2 * minimumColumnWidth + parseFloat(getComputedStyle(element).columnGap),
          minimumColumnWidth,
          columns: columns.length,
          columnWidth: Math.min(...columns.map((column) => column.width)),
        };
      });

      const context = `${path} at ${width}px`;
      expect(layout.columns, context).toBe(layout.fits ? 2 : 1);
      if (layout.columns > 1) {
        expect(layout.columnWidth, context).toBeGreaterThanOrEqual(layout.minimumColumnWidth);
      }
    }
  }
});

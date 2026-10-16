import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// Fixtures in tests/e2e/pages/[fixture].astro: /e2e/credits/ fills every
// credit, with a role and the award in Czech only, and a brief; /e2e/project/
// fills none and has no brief; /e2e/work-credits/ lists Alpha brief with the
// same credits and Credits only, with a studio and nothing else.
const sheet = (scope: Page | Locator) => scope.locator('dl');
// Text content, as labels are uppercase only on screen.
const labels = (scope: Page | Locator) =>
  sheet(scope).locator('dt span').filter({ visible: true }).allTextContents();
const values = (scope: Page | Locator) =>
  sheet(scope).locator('dd p').filter({ visible: true }).allInnerTexts();
const brief = (page: Page) => page.locator('article header .running-text').filter({ visible: true });

test('a project page’s fact sheet shows its filled rows in the visitor’s language, one collaborator a line', async ({
  page,
}) => {
  await page.goto('/e2e/credits/');
  expect(await labels(page)).toEqual(['Location', 'Period', 'Status', 'Design studio', 'Design team', 'Collaboration']);
  expect(await values(page)).toEqual([
    'Nowhere',
    '3/2025–6/2026',
    'Competition entry',
    'Studio North | Ing. arch. Jana Nováková',
    'Jan Novák, Eva Dvořáková',
    'Ing. Petr Malý – Visualizations',
    'Ing. Pavel Velký',
    'Ing. Iva Tichá',
  ]);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  expect(await labels(page)).toEqual([
    'Místo',
    'Období',
    'Stav',
    'Autorský ateliér',
    'Autorský tým',
    'Spolupráce',
    'Ocenění',
  ]);
  expect(await values(page)).toEqual([
    'Nikde',
    '3/2025–6/2026',
    'Soutěžní návrh',
    'Studio North | Ing. arch. Jana Nováková',
    'Jan Novák, Eva Dvořáková',
    'Ing. Petr Malý – vizualizace',
    'Ing. Pavel Velký – statika',
    'Ing. Iva Tichá',
    'Odměna za dílčí podnět',
  ]);
});

test('a project without credits shows only its place and period', async ({ page }) => {
  await page.goto('/e2e/project/');
  expect(await labels(page)).toEqual(['Location', 'Period']);
  expect(await values(page)).toEqual(['Nowhere', '3/2025–6/2026']);
  await expect(brief(page)).toHaveCount(0);
});

test('the brief and the sheet share the width in equal columns on wide screens and stack on phones', async ({
  page,
}) => {
  await page.goto('/e2e/credits/');
  await page.setViewportSize({ width: 1280, height: 900 });
  let [title, briefBox, sheetBox] = await Promise.all([
    page.locator('article h1:visible').boundingBox(),
    brief(page).boundingBox(),
    sheet(page).boundingBox(),
  ]);
  expect(briefBox!.x).toBeCloseTo(title!.x, 0);
  expect(sheetBox!.x).toBeGreaterThan(briefBox!.x + briefBox!.width);
  expect(sheetBox!.width).toBeCloseTo(briefBox!.width, 0);
  expect(Math.abs(sheetBox!.y - briefBox!.y)).toBeLessThan(16);

  await page.setViewportSize({ width: 390, height: 900 });
  [briefBox, sheetBox] = await Promise.all([brief(page).boundingBox(), sheet(page).boundingBox()]);
  expect(sheetBox!.y).toBeGreaterThan(briefBox!.y + briefBox!.height);
  expect(sheetBox!.x).toBeCloseTo(briefBox!.x, 0);
  expect(sheetBox!.width).toBeCloseTo(briefBox!.width, 0);
});

test('without a brief the sheet keeps its column, under the title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/e2e/project/');
  const [title, sheetBox, article] = await Promise.all([
    page.locator('article h1:visible').boundingBox(),
    sheet(page).boundingBox(),
    page.locator('article').boundingBox(),
  ]);
  expect(sheetBox!.x).toBeCloseTo(title!.x, 0);
  expect(sheetBox!.width).toBeLessThan(article!.width / 2);
});

test('labels sit beside their values where the sheet has room, above them on phones', async ({ page }) => {
  await page.goto('/e2e/credits/');
  const row = sheet(page).locator('div').filter({ hasText: 'Design studio' });
  const label = row.locator('dt');
  const value = row.locator('dd');
  for (const [width, beside] of [
    [1280, true],
    [390, false],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    const [labelBox, valueBox] = await Promise.all([label.boundingBox(), value.boundingBox()]);
    if (beside) {
      expect(valueBox!.x, `${width}px`).toBeGreaterThan(labelBox!.x + labelBox!.width);
    } else {
      expect(valueBox!.y, `${width}px`).toBeGreaterThanOrEqual(labelBox!.y + labelBox!.height);
      expect(valueBox!.x, `${width}px`).toBeCloseTo(labelBox!.x, 0);
    }
  }
});

test('values line up at the same place on every project, in either language', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const valueLeft = async () => (await sheet(page).locator('dd').first().boundingBox())!.x;
  await page.goto('/e2e/project/');
  const bare = await valueLeft();
  await page.goto('/e2e/credits/');
  const credited = await valueLeft();
  expect(credited - (await sheet(page).boundingBox())!.x).toBeCloseTo(
    bare - (await page.locator('article h1:visible').boundingBox())!.x,
    0,
  );
  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  expect(await valueLeft()).toBeCloseTo(credited, 0);
});

test('credits are short lines, not justified', async ({ page }) => {
  await page.goto('/e2e/credits/');
  const lines = await sheet(page).locator('dd p').filter({ visible: true }).all();
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    await expect(line).not.toHaveCSS('text-align', 'justify');
  }
});

test('an opened index row shows the brief, then the sheet without the place and period the row shows', async ({
  page,
}) => {
  await page.goto('/e2e/work-credits/');
  const row = page.locator('main ul > li').nth(0);
  await row.getByText('Alpha brief').click();
  const opened = row.locator('details > div');
  expect(await labels(opened)).toEqual(['Status', 'Design studio', 'Design team', 'Collaboration']);

  const briefText = row.getByText('First line').filter({ visible: true });
  const [briefBox, sheetBox] = await Promise.all([briefText.boundingBox(), sheet(row).boundingBox()]);
  expect(sheetBox!.y).toBeGreaterThan(briefBox!.y + briefBox!.height);
  expect(sheetBox!.x).toBeCloseTo(briefBox!.x, 0);
});

test('an index row with credits and no brief opens to its sheet', async ({ page }) => {
  await page.goto('/e2e/work-credits/');
  const row = page.locator('main ul > li').nth(1);
  await expect(sheet(row)).toBeHidden();
  await row.getByText('Credits only').click();
  expect(await labels(row)).toEqual(['Design studio']);
  expect(await values(row)).toEqual(['Studio North | Ing. arch. Jana Nováková']);
});

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
  sheet(scope).locator('dd p, dd li').filter({ visible: true }).allInnerTexts();
const brief = (page: Page) => page.locator('article header .running-text').filter({ visible: true });

test('a project page’s fact sheet shows its filled rows in the visitor’s language, one collaborator a line', async ({
  page,
}) => {
  await page.goto('/e2e/credits/');
  expect(await labels(page)).toEqual(['Location', 'My involvement', 'Intervention', 'Scope', 'Studio', 'Project team']);
  expect(await values(page)).toEqual([
    'Nowhere',
    '3/2025–6/2026',
    'Renovation',
    'Extension',
    'Architecture',
    'Interior',
    'Studio North | Ing. arch. Jana Nováková',
    'Design team: Jan Novák, Eva Dvořáková',
    'Ing. Petr Malý – Visualizations',
    'Ing. Pavel Velký',
    'Ing. Iva Tichá',
  ]);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  expect(await labels(page)).toEqual([
    'Místo',
    'Moje zapojení',
    'Zásah',
    'Zaměření',
    'Ateliér',
    'Tým projektu',
    'Ocenění',
  ]);
  expect(await values(page)).toEqual([
    'Nikde',
    '3/2025–6/2026',
    'Rekonstrukce',
    'Přístavba',
    'Architektura',
    'Interiér',
    'Studio North | Ing. arch. Jana Nováková',
    'Autorský tým: Jan Novák, Eva Dvořáková',
    'Ing. Petr Malý – vizualizace',
    'Ing. Pavel Velký – statika',
    'Ing. Iva Tichá',
    'Odměna za dílčí podnět',
  ]);
});

test('a project without credits shows only its place and period', async ({ page }) => {
  await page.goto('/e2e/project/');
  expect(await labels(page)).toEqual(['Location', 'My involvement']);
  expect(await values(page)).toEqual(['Nowhere', '3/2025–6/2026']);
  await expect(brief(page)).toHaveCount(0);
});

test('the brief sits above the full-width fact sheet at every screen size', async ({
  page,
}) => {
  await page.goto('/e2e/credits/');
  for (const width of [1280, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [title, briefBox, sheetBox, header] = await Promise.all([
      page.locator('article h1:visible').boundingBox(),
      brief(page).boundingBox(),
      sheet(page).boundingBox(),
      page.locator('article header').boundingBox(),
    ]);
    expect(briefBox!.x, `${width}px`).toBeCloseTo(title!.x, 0);
    expect(sheetBox!.y, `${width}px`).toBeGreaterThan(briefBox!.y + briefBox!.height);
    expect(sheetBox!.x, `${width}px`).toBeCloseTo(briefBox!.x, 0);
    expect(sheetBox!.width, `${width}px`).toBeCloseTo(header!.width, 0);
  }
});

test('without a brief the sheet fills the width under the title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/e2e/project/');
  const [title, sheetBox, header] = await Promise.all([
    page.locator('article h1:visible').boundingBox(),
    sheet(page).boundingBox(),
    page.locator('article header').boundingBox(),
  ]);
  expect(sheetBox!.x).toBeCloseTo(title!.x, 0);
  expect(sheetBox!.width).toBeCloseTo(header!.width, 0);
});

test('fact rows form two intact groups when both fit and one group on narrower screens', async ({ page }) => {
  await page.goto('/e2e/credits/');
  for (const language of ['en', 'cs']) {
    if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    for (const [width, groups] of [[1280, 2], [980, 1], [834, 1], [390, 1]] as const) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await sheet(page).locator(':scope > div').filter({ visible: true }).evaluateAll((rows) =>
        rows.map((row) => ({
          left: Math.round(row.getBoundingClientRect().left),
          fragments: row.getClientRects().length,
        })),
      );
      expect(new Set(rows.map(({ left }) => left)).size, `${language}, ${width}px`).toBe(groups);
      expect(rows.every(({ fragments }) => fragments === 1), `${language}, ${width}px`).toBe(true);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
        message: `${language}, ${width}px`,
      }).toBe(width);
    }
  }
});

test('labels sit beside their values where the sheet has room, above them on phones', async ({ page }) => {
  await page.goto('/e2e/credits/');
  const row = sheet(page).locator('div').filter({ hasText: 'Studio' });
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
  const row = page.locator('main > div > ul > li').nth(0);
  await row.getByText('Alpha brief').click();
  const opened = row.locator('details > div');
  expect(await labels(opened)).toEqual(['Intervention', 'Scope', 'Studio', 'Project team']);

  const briefText = row.getByText('First line').filter({ visible: true });
  const [briefBox, sheetBox] = await Promise.all([briefText.boundingBox(), sheet(row).boundingBox()]);
  expect(sheetBox!.y).toBeGreaterThan(briefBox!.y + briefBox!.height);
  expect(sheetBox!.x).toBeCloseTo(briefBox!.x, 0);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  expect(await labels(opened)).toEqual(['Zásah', 'Zaměření', 'Ateliér', 'Tým projektu', 'Ocenění']);
});

test('an index row with credits and no brief opens to its sheet', async ({ page }) => {
  await page.goto('/e2e/work-credits/');
  const row = page.locator('main > div > ul > li').nth(1);
  await expect(sheet(row)).toBeHidden();
  await row.getByText('Credits only').click();
  expect(await labels(row)).toEqual(['Studio']);
  expect(await values(row)).toEqual(['Studio North | Ing. arch. Jana Nováková']);
});


test('project context and progress are quiet bilingual badges above the labelled contribution', async ({ page }) => {
  await page.goto('/e2e/credits/');
  const header = page.locator('article header');
  for (const [language, contribution, badges] of [
    ['en', 'My contribution', ['Academic project', 'Competition entry', 'Design in progress', 'Construction planned']],
    ['cs', 'Moje práce', ['Školní projekt', 'Soutěžní návrh', 'Probíhá projektování', 'Plánovaná realizace']],
  ] as const) {
    if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    await expect(header.getByRole('heading', { name: contribution, exact: true })).toBeVisible();
    const badgeList = header.locator(':scope > ul');
    expect(await badgeList.locator('li:visible').allInnerTexts()).toEqual(badges);
    await expect(badgeList.getByRole('link')).toHaveCount(0);
    await expect(badgeList.getByRole('button')).toHaveCount(0);
    const [badgesBox, contributionBox] = await Promise.all([badgeList.boundingBox(), header.getByRole('heading', { name: contribution, exact: true }).boundingBox()]);
    expect(badgesBox!.y + badgesBox!.height).toBeLessThan(contributionBox!.y);
  }
});

test('missing project classifications render no badges or contribution heading', async ({ page }) => {
  await page.goto('/e2e/project/');
  await expect(page.locator('article header > ul')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My contribution', exact: true })).toHaveCount(0);
});

test('a metadata-only index row expands to its context badges', async ({ page }) => {
  await page.goto('/e2e/work-credits/');
  const row = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Badges only' }) });
  await row.getByText('Badges only', { exact: true }).click();
  await expect(row.getByText('Self-initiated project', { exact: true })).toBeVisible();
  await expect(row.getByText('Commissioned project', { exact: true })).toBeVisible();
  await expect(row.getByRole('heading', { name: 'My contribution', exact: true })).toHaveCount(0);
});


for (const surface of ['project', 'work']) {
  for (const suppliedLanguage of ['cs', 'en']) {
    test(`a ${surface} contribution supplied only in ${suppliedLanguage} has its heading only in that language`, async ({ page }) => {
      await page.goto(`/e2e/${surface}-${suppliedLanguage}-contribution/`);
      if (surface === 'work') await page.locator('summary').click();
      const heading = page.getByRole('heading', { name: /^(My contribution|Moje práce)$/ });
      if (suppliedLanguage === 'en') await expect(heading).toHaveText('My contribution');
      else await expect(heading).toHaveCount(0);
      await page.locator('[data-lang-toggle]').click();
      if (suppliedLanguage === 'cs') await expect(heading).toHaveText('Moje práce');
      else await expect(heading).toHaveCount(0);
    });
  }
}

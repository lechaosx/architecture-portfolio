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
const values = async (scope: Page | Locator) =>
  (await sheet(scope).locator('dd > p, dd > ul > li').filter({ visible: true }).allInnerTexts())
    .map((text) => text.split('\n').map((line) => line.trim()).filter(Boolean).join('\n'));
const brief = (page: Page) => page.locator('article header .running-text').filter({ visible: true });

test('a project page’s fact sheet shows its filled rows in the visitor’s language, one item per collaborator', async ({
  page,
}) => {
  await page.goto('/e2e/credits/');
  expect(await labels(page)).toEqual(['Location', 'Involvement period', 'Intervention', 'Scope', 'Studio', 'Collaborators']);
  expect(await values(page)).toEqual([
    'Nowhere',
    '3/2025–6/2026',
    'Renovation',
    'Extension',
    'Architecture',
    'Interior',
    'Studio North | Ing. arch. Jana Nováková',
    'Jan Novák\nDesign author · Coordination',
    'Eva Dvořáková\nDesign author',
    'Ing. Petr Malý\nVisualizations',
    'Ing. Pavel Velký',
    'Ing. Iva Tichá',
  ]);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  expect(await labels(page)).toEqual([
    'Místo',
    'Období zapojení',
    'Zásah',
    'Zaměření',
    'Ateliér',
    'Spolupráce',
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
    'Jan Novák\nAutor návrhu · koordinace',
    'Eva Dvořáková\nAutor návrhu',
    'Ing. Petr Malý\nvizualizace',
    'Ing. Pavel Velký\nstatika',
    'Ing. Iva Tichá',
    'Odměna za dílčí podnět',
  ]);
});

test('a project without credits shows only its place and period', async ({ page }) => {
  await page.goto('/e2e/project/');
  expect(await labels(page)).toEqual(['Location', 'Involvement period']);
  expect(await values(page)).toEqual(['Nowhere', '3/2025–6/2026']);
  await expect(brief(page)).toHaveCount(0);
  await expect(sheet(page).getByRole('link')).toHaveCount(0);
});

for (const path of ['/e2e/project-role/', '/e2e/work-role-only/']) {
  test(`my role is bilingual and visible on ${path}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lang', 'en'));
    await page.goto(path);
    const index = path.includes('work-');
    if (index) {
      await page.getByRole('heading', { name: 'My role only' }).click();
      await expect(page.locator('details')).toHaveAttribute('open', '');
    } else {
      const work = await page.locator('script[type="application/ld+json"]').evaluate((element) =>
        JSON.parse(element.textContent!)['@graph'].find((node: Record<string, unknown>) => node['@type'] === 'CreativeWork'),
      );
      expect(work.contributor[0]).toEqual({
        '@type': 'Role', roleName: 'Návrh interiéru, dokumentace',
        contributor: { '@id': new URL('/#person', work.url).href },
      });
      expect(work).not.toHaveProperty('creator');
    }
    for (const [language, label, role, collaborator] of [
      ['en', 'My role', 'Interior design, documentation', 'Jan Novák\nStructural design'],
      ['cs', 'Moje role', 'Návrh interiéru, dokumentace', 'Jan Novák\nStatika'],
    ] as const) {
      if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
      await expect(sheet(page).getByText(label, { exact: true })).toBeVisible();
      await expect(sheet(page).getByText(role, { exact: true })).toBeVisible();
      if (index) {
        expect(await labels(page)).toEqual([label]);
      } else {
        expect(await values(page)).toContain(collaborator);
        await expect(brief(page)).toContainText(language === 'en' ? 'A library with a public garden.' : 'Knihovna s veřejnou zahradou.');
        await expect(sheet(page).getByText('Tereza Kalábková', { exact: true })).toHaveCount(0);
      }
      for (const width of [1280, 800, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
    }
  });
}

for (const path of ['/e2e/credits/', '/e2e/work-credits/']) {
  test(`collaborators are people with optional secondary roles on ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path.includes('work-')) await page.getByText('Alpha brief', { exact: true }).click();
    for (const [language, label, role] of [
      ['en', 'Collaborators', 'Design author · Coordination'],
      ['cs', 'Spolupráce', 'Autor návrhu · koordinace'],
    ] as const) {
      if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
      const list = sheet(page).locator(':scope > div').filter({ has: page.getByText(label, { exact: true }) }).getByRole('list');
      await expect(list.getByRole('listitem')).toHaveCount(5);
      const person = list.getByRole('listitem').filter({ has: page.getByText('Jan Novák', { exact: true }) });
      const name = person.getByText('Jan Novák', { exact: true });
      const roleText = person.getByText(role, { exact: true });
      await expect(name).toBeVisible();
      await expect(roleText).toBeVisible();
      const [nameBox, roleBox] = await Promise.all([name.boundingBox(), roleText.boundingBox()]);
      expect(roleBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
      const style = (element: Element) => ({ size: parseFloat(getComputedStyle(element).fontSize), color: getComputedStyle(element).color });
      const [nameStyle, roleStyle] = await Promise.all([name.evaluate(style), roleText.evaluate(style)]);
      expect(roleStyle.size).toBeLessThan(nameStyle.size);
      expect(roleStyle.color).not.toBe(nameStyle.color);
      const unfilled = list.getByRole('listitem').filter({ has: page.getByText('Ing. Iva Tichá', { exact: true }) });
      expect(await unfilled.innerText()).toBe('Ing. Iva Tichá');
      const [itemBox, bareName] = await Promise.all([unfilled.boundingBox(), unfilled.getByText('Ing. Iva Tichá', { exact: true }).boundingBox()]);
      expect(itemBox!.height).toBeCloseTo(bareName!.height, 0);
    }
  });
}

test('an optional project website appears on the project page and expands a link-only index entry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'));
  const hostname = 'architecture-and-urban-design.example.org';
  const target = `https://${hostname}/projects/library?view=plan#drawings`;
  for (const path of ['/e2e/project-link/', '/e2e/work-project-link/']) {
    await page.goto(path);
    if (path.includes('work-')) {
      await page.getByRole('heading', { name: 'External project' }).click();
      await expect(page.locator('details')).toHaveAttribute('open', '');
    }
    for (const [language, label] of [['en', 'Project website'], ['cs', 'Odkaz na projekt']] as const) {
      if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
      await expect(sheet(page).getByText(label, { exact: true })).toBeVisible();
      const link = sheet(page).getByRole('link', { name: hostname, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', target);
      for (const width of [1280, 800, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const box = await link.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
    }
  }
});

test('the brief precedes full-width facts below the title at every screen size', async ({ page }) => {
  await page.goto('/e2e/credits/');
  await page.evaluate(() => document.fonts.ready);
  for (const language of ['en', 'cs']) {
    if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    for (const width of [1280, 800, 700, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const [title, briefBox, sheetBox, header] = await Promise.all([
        page.locator('article h1:visible').boundingBox(),
        brief(page).boundingBox(),
        sheet(page).boundingBox(),
        page.locator('article header').boundingBox(),
      ]);
      expect(title!.width, `${language} ${width}px`).toBeCloseTo(header!.width, 0);
      expect(briefBox!.x, `${language} ${width}px`).toBeCloseTo(title!.x, 0);
      expect(briefBox!.y, `${language} ${width}px`).toBeGreaterThan(title!.y + title!.height);
      expect(sheetBox!.x, `${language} ${width}px`).toBeCloseTo(title!.x, 0);
      expect(sheetBox!.y, `${language} ${width}px`).toBeGreaterThan(briefBox!.y + briefBox!.height);
      expect(sheetBox!.width, `${language} ${width}px`).toBeCloseTo(header!.width, 0);
      expect(briefBox!.width, `${language} ${width}px`).toBeLessThanOrEqual(header!.width);
      const factColumns = await sheet(page).locator(':scope > div:visible').evaluateAll((rows) =>
        new Set(rows.map((row) => Math.round(row.getBoundingClientRect().left))).size,
      );
      expect(factColumns, `${language} ${width}px`).toBe(width === 1280 ? 2 : 1);
      const lines = await brief(page).evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines: { x: number; y: number; right: number }[] = [];
        for (const rect of range.getClientRects()) {
          // Chromium gives a generated hyphen its own adjoining rectangle.
          const line = lines.find((line) => Math.abs(line.y - rect.y) < 1 && Math.abs(line.right - rect.x) < 1);
          if (line) line.right = rect.right;
          else lines.push({ x: rect.x, y: rect.y, right: rect.right });
        }
        return new Set(lines.map((line) => Math.round(line.x))).size;
      });
      await expect(page.getByRole('heading', { name: /^(My contribution|Moje práce)$/ })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(lines, `${language} ${width}px`).toBe(1);
    }
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
  expect(title!.width).toBeCloseTo(header!.width, 0);
  expect(sheetBox!.width).toBeCloseTo(header!.width, 0);
});

for (const path of ['/e2e/credits-no-brief/', '/e2e/credits-blank-brief/']) {
  test(`an absent or blank brief leaves full-width facts on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(brief(page)).toHaveCount(0);
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
        const [sheetBox, header] = await Promise.all([sheet(page).boundingBox(), page.locator('article header').boundingBox()]);
        expect(sheetBox!.x, `${language}, ${width}px`).toBeCloseTo(header!.x, 0);
        expect(sheetBox!.width, `${language}, ${width}px`).toBeCloseTo(header!.width, 0);
        expect(new Set(rows.map(({ left }) => left)).size, `${language}, ${width}px`).toBe(groups);
        expect(rows.every(({ fragments }) => fragments === 1), `${language}, ${width}px`).toBe(true);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `${language}, ${width}px`,
        }).toBe(width);
      }
    }
  });
}

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

test('wide fact labels fit on one line in either language', async ({ page }) => {
  await page.goto('/e2e/credits/');
  for (const language of ['en', 'cs']) {
    if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1280, 800]) {
      await page.setViewportSize({ width, height: 900 });
      const labels = await sheet(page).locator('dt span:visible').evaluateAll((labels) => labels.map((label) => {
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          text: label.textContent,
          lines: new Set(Array.from(range.getClientRects()).filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size,
        };
      }));
      for (const label of labels) expect(label.lines, `${language} ${width}px ${label.text}`).toBe(1);
    }
  }
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
  expect(await labels(opened)).toEqual(['Intervention', 'Scope', 'Studio', 'Collaborators']);

  await expect(row.getByRole('heading', { name: /^(My contribution|Moje práce)$/ })).toHaveCount(0);
  const briefText = row.getByText('First line').filter({ visible: true });
  await expect(briefText).toBeVisible();
  const [briefBox, sheetBox] = await Promise.all([briefText.boundingBox(), sheet(row).boundingBox()]);
  expect(sheetBox!.y).toBeGreaterThan(briefBox!.y + briefBox!.height);
  expect(sheetBox!.x).toBeCloseTo(briefBox!.x, 0);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  expect(await labels(opened)).toEqual(['Zásah', 'Zaměření', 'Ateliér', 'Spolupráce', 'Ocenění']);
  await expect(row.getByText('První řádek').filter({ visible: true })).toBeVisible();
  await expect(row.getByRole('heading', { name: /^(My contribution|Moje práce)$/ })).toHaveCount(0);
});

test('an index row with credits and no brief opens to its sheet', async ({ page }) => {
  await page.goto('/e2e/work-credits/');
  const row = page.locator('main > div > ul > li').nth(1);
  await expect(sheet(row)).toBeHidden();
  await row.getByText('Credits only').click();
  expect(await labels(row)).toEqual(['Studio']);
  expect(await values(row)).toEqual(['Studio North | Ing. arch. Jana Nováková']);
});


test('project context and progress are quiet bilingual badges below the title', async ({ page }) => {
  await page.goto('/e2e/credits/');
  const header = page.locator('article header');
  for (const [language, badges] of [
    ['en', ['Academic project', 'Competition entry', 'Design in progress', 'Construction planned']],
    ['cs', ['Školní projekt', 'Soutěžní návrh', 'Probíhá projektování', 'Plánovaná realizace']],
  ] as const) {
    if (language === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    await expect(brief(page)).toBeVisible();
    await expect(header.getByRole('heading', { name: /^(My contribution|Moje práce)$/ })).toHaveCount(0);
    const badgeList = header.locator('h1:visible').locator('..').locator(':scope > ul');
    expect(await badgeList.locator('li:visible').allInnerTexts()).toEqual(badges);
    await expect(badgeList.getByRole('link')).toHaveCount(0);
    await expect(badgeList.getByRole('button')).toHaveCount(0);
    const [badgesBox, titleBox] = await Promise.all([badgeList.boundingBox(), header.locator('h1:visible').boundingBox()]);
    expect(badgesBox!.x).toBeCloseTo(titleBox!.x, 0);
    expect(badgesBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
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

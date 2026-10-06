import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const visibleText = { useInnerText: true };
const section = (page: Page, heading: string | RegExp) =>
  page.locator('main section', {
    has: page.getByRole('heading', { level: 2, name: heading, exact: true }),
  });
const box = async (page: Page, text: string) =>
  (await page.locator('main').getByText(text, { exact: true }).boundingBox())!;

test('timeline rows keep their order, with place and years beside the title', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/e2e/about/');
  await expect(section(page, 'Experience').getByRole('heading', { level: 3 })).toHaveText([
    'Architect',
    'Intern',
  ]);
  const titles = ['Experience', 'Education', 'Awards'];
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveText([
    'Services',
    ...titles,
    'Approach',
  ]);

  const place = await box(page, 'Studio A, Brno');
  const years = await box(page, '2024–');
  const title = await box(page, 'Architect');
  expect(place.x + place.width).toBeLessThan(title.x);
  expect(years.x + years.width).toBeLessThan(title.x);
  expect(Math.abs(place.y - title.y)).toBeLessThan(8);
  expect(years.y).toBeGreaterThan(place.y);
});

test('on phones a timeline row stacks to the right of its line, tags last', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/e2e/about/');
  const place = await box(page, 'Studio A, Brno');
  const years = await box(page, '2024–');
  const title = await box(page, 'Architect');
  const entry = page.locator('main li', { has: page.getByRole('heading', { name: 'Architect', exact: true }) });
  const description = (await entry.getByText(/^The drawing/).boundingBox())!;
  const tag = (await entry.getByRole('listitem').first().boundingBox())!;
  expect(years.y).toBeGreaterThan(place.y);
  expect(title.y).toBeGreaterThan(years.y + years.height);
  expect(tag.y).toBeGreaterThan(description.y + description.height);
  expect(title.x).toBeCloseTo(place.x);
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

test('a timeline description keeps the author’s paragraphs in both languages', async ({
  page,
}) => {
  await page.goto('/e2e/about/');
  // The paragraphs in the title's own cell.
  const description = (title: string) =>
    page
      .getByRole('heading', { level: 3, name: title, exact: true })
      .locator('xpath=..')
      .getByRole('paragraph');
  await expect(description('Architect')).toHaveText([/^The drawing/, 'Permit drawings.']);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(description('Architektka')).toHaveText([/^Výkres/, 'Výkresy k povolení.']);
});

test('badges list each entry’s tags and the services', async ({ page }) => {
  await page.goto('/e2e/about/');
  const entry = (title: string) =>
    page.locator('main li', { has: page.getByRole('heading', { level: 3, name: title, exact: true }) });
  await expect(entry('Architect').getByRole('listitem')).toHaveText([
    'BIM',
    'Studies',
    'Building permits',
  ], visibleText);
  await expect(entry('Intern').getByRole('listitem')).toHaveCount(0);
  await expect(entry('2nd place').getByRole('listitem')).toHaveText(['Urbanism'], visibleText);
  await expect(section(page, 'Services').getByRole('listitem')).toHaveText([
    'Family houses',
    'Renovations',
    'Interiors',
  ], visibleText);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(entry('Architektka').getByRole('listitem')).toHaveText([
    'BIM',
    'Studie',
    'Stavební povolení',
  ], visibleText);
});

test('the contact list links email and phone and says where and when', async ({ page }) => {
  await page.goto('/e2e/about/');
  const contacts = page.locator('main address');
  await expect(contacts.getByRole('link', { name: 'jana@example.cz' })).toHaveAttribute(
    'href',
    'mailto:jana@example.cz',
  );
  await expect(contacts.getByRole('link', { name: '+420 777 000 000' })).toHaveAttribute(
    'href',
    'tel:+420777000000',
  );
  await expect(contacts.getByText('Brno', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(contacts.getByText('Mon–Fri 9–17')).toBeVisible();
});

test('a contact line filled in one language shows only in that language', async ({ page }) => {
  await page.goto('/e2e/about-bare/');
  const contacts = page.locator('main address');
  await expect(contacts.getByRole('link', { name: 'jana@example.cz' })).toBeVisible();
  await expect(contacts.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(contacts.getByText('Brno', { exact: true })).toBeVisible();
  await expect(contacts.getByRole('listitem')).toHaveCount(2);
});

test('with nothing optional filled, only the bio and the email remain', async ({ page }) => {
  await page.goto('/e2e/about-bare/');
  await expect(page.locator('main').getByRole('heading')).toHaveText(['About']);
  await expect(page.locator('main img')).toHaveCount(0);
});

test('the side bar sits beside the main column on wide screens, above it on phones', async ({
  page,
}) => {
  await page.goto('/e2e/about/');
  const portrait = page.locator('main img').first();
  const heading = page.locator('main h1:visible');
  const bio = page.locator('main .prose:visible');

  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await portrait.boundingBox())!.x + (await portrait.boundingBox())!.width).toBeLessThan(
    (await heading.boundingBox())!.x,
  );

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const [h, p, b] = await Promise.all([heading, portrait, bio].map((l) => l.boundingBox()));
    expect(p!.x, `${width}px`).toBeCloseTo(h!.x);
    expect(b!.y, `${width}px`).toBeGreaterThan(p!.y + p!.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px`,
    ).toBe(true);
  }
});

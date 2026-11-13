import { expect, test, type Locator, type Page } from '@playwright/test';
import { site } from './architect';
import { expectServicesWrapWhole } from './services-line';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const box = async (locator: Locator) => (await locator.boundingBox())!;
const bottom = async (locator: Locator) => {
  const { y, height } = await box(locator);
  return y + height;
};

const name = `${site.credential} ${site.name}`;

const selectedWork = (page: Page) =>
  page.locator('main section', {
    has: page.getByRole('heading', { level: 2, name: 'Selected work' }),
  });

test('the caption under the images says what she is, where and what she offers, and links to About', async ({
  page,
}) => {
  // tests/e2e/pages/[fixture].astro: located in Brno, with three services.
  await page.goto('/e2e/landing/');
  const services = page.locator('main div:has(> h1)').getByRole('list');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} – Architect · Brno`);
  await expect(services).toBeVisible();
  await expect(services.getByRole('listitem')).toHaveText([/^·?\s*Family houses$/, /^·?\s*Renovations$/, /^·?\s*Interiors$/]);
  await page.getByRole('link', { name: 'Switch to Czech' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} – Architektka · Brno`);
  await expect(services.getByRole('listitem')).toHaveText([/^·?\s*Rodinné domy$/, /^·?\s*Rekonstrukce$/, /^·?\s*Interiéry$/]);
  await page.getByRole('link', { name: 'O mně →' }).click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test('without services or a place the line is the profession', async ({ page }) => {
  await page.goto('/e2e/landing-bare/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} – Architect`);
  await expect(page.getByText(/Family houses/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Switch to Czech' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${name} – Architektka`);
});

test('a service wraps to the next line whole, and no separator starts or ends a line', async ({ page }) => {
  await expectServicesWrapWhole(page, 'landing-long-services', (page) => page.locator('main div:has(> h1)').getByRole('list'));
});

test('the site description is not shown, only used as the page description', async ({ page }) => {
  await page.goto('/e2e/landing/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', site.description.en);
  await expect(page.locator('main')).not.toContainText(site.description.en);
});

test('the landing page ends with the selected work', async ({ page }) => {
  await page.goto('/e2e/landing/');
  await expect(page.locator('main').getByRole('heading', { level: 2 }).last()).toHaveText('Selected work');
});

test('selected work is the chosen projects in their order, with a link to all work', async ({
  page,
}) => {
  // tests/e2e/pages/[fixture].astro: four projects, chosen out of date order.
  await page.goto('/e2e/landing/');
  await expect(selectedWork(page).getByRole('heading', { level: 3 })).toHaveText([
    'Project 2024',
    'Grid project',
    'Project 2023',
    'Project 2025',
  ]);
  await selectedWork(page).getByRole('link', { name: 'All work →' }).click();
  await expect(page).toHaveURL(/\/work\/$/);
});

test('with no projects chosen there is no selected work', async ({ page }) => {
  await page.goto('/e2e/landing-no-work/');
  await expect(page.getByRole('heading', { name: 'Selected work' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All work →' })).toHaveCount(0);
});

test('with no images the landing page starts with the identity line', async ({ page }) => {
  await page.goto('/e2e/landing-bare/');
  await expect(page.locator('[data-carousel]')).toHaveCount(0);
  await expect(page.locator('main img')).toHaveCount(await page.locator('main .grid img').count());
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the hero sits closer under the header than a page heading', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/landing-bare/');
    const header = page.locator('body > header');
    const headingGap = (await box(page.locator('main h1:visible'))).y - (await bottom(header));
    for (const fixture of ['landing-single', 'landing']) {
      await page.goto(`/e2e/${fixture}/`);
      const heroGap = (await box(page.locator('main :is([data-carousel], img)').first())).y - (await bottom(header));
      expect(heroGap, `${fixture} at ${width}px`).toBeGreaterThan(0);
      expect(heroGap, `${fixture} at ${width}px`).toBeLessThan(headingGap);
    }
  }
});

test('the About link ends the identity row, on phones too', async ({ page }) => {
  for (const [fixture, width] of [
    ['landing', 1280],
    ['landing-bare', 390],
    ['landing-long-services', 1280],
    ['landing-long-services', 320],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/e2e/${fixture}/`);
    const identity = page.locator('main h1:visible');
    const link = page.getByRole('link', { name: 'About →' });
    const [i, l, content] = await Promise.all([identity, link, selectedWork(page)].map(box));
    expect(l.y + l.height / 2, `${width}px`).toBeGreaterThan(i.y);
    expect(l.y + l.height / 2, `${width}px`).toBeLessThan(i.y + i.height);
    expect(l.x + l.width, `${width}px`).toBeCloseTo(content.x + content.width, 0);
  }
});

test('the link to all work closes the selected-work heading row', async ({ page }) => {
  await page.goto('/e2e/landing/');
  const heading = page.getByRole('heading', { level: 2, name: 'Selected work' });
  const link = page.getByRole('link', { name: 'All work →' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [h, l, section] = await Promise.all([heading, link, selectedWork(page)].map(box));
    expect(l.y + l.height / 2, `${width}px`).toBeGreaterThan(h.y);
    expect(l.y + l.height / 2, `${width}px`).toBeLessThan(h.y + h.height);
    expect(l.x + l.width, `${width}px`).toBeCloseTo(section.x + section.width, 0);
  }
});

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('primary navigation reaches every page and marks the current section', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approach' })).toBeVisible();

  const workLink = page.getByRole('link', { name: 'Work', exact: true });
  await workLink.click();
  await expect(page).toHaveURL(/\/work\/?$/);
  await expect(workLink).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();

  await page.locator('main section.grid > a').first().click();
  await expect(page).toHaveURL(/\/projects\/.+\/$/);
  await page.getByRole('link', { name: 'Back to work' }).click();
  await expect(page).toHaveURL(/\/work\/?$/);

  const contactLink = page.getByRole('link', { name: 'Contact', exact: true });
  await contactLink.click();
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(contactLink).toHaveAttribute('aria-current', 'page');

  await page.locator('header nav > a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);
});

test('language selection follows URL, saved choice, and browser preference', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'cs-CZ' });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('link', { name: 'Práce' })).toBeVisible();

  await page.evaluate(() => localStorage.setItem('lang', 'en'));
  await page.goto('/contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'When to reach me' }),
  ).toBeVisible();

  await page.goto('/?lang=cs');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('heading', { name: 'O mně' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('cs');

  await page.getByRole('button', { name: 'Přepnout do angličtiny' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page).toHaveTitle(/Architecture/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /architect/i,
  );

  await page.goto('/contact');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await context.close();
});

test('theme follows the system and an explicit choice persists across navigation', async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page
      .locator('main img')
      .first()
      .evaluate((image) => getComputedStyle(image).filter),
  ).toBe('none');

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

  await page.goto('/work');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await context.close();
});

test('work projects are sorted and the grid follows its responsive breakpoints', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/work');
  const grid = page.locator('main section.grid');
  const cards = grid.locator(':scope > a');
  const rendered = await cards.evaluateAll((elements) =>
    elements.map((element) => ({
      title: element.querySelector('h3[lang="en"]')?.textContent?.trim() ?? '',
      year: Number(element.querySelector('span.text-sm')?.textContent),
    })),
  );
  expect(rendered).toEqual(
    [...rendered].sort(
      (a, b) => b.year - a.year || a.title.localeCompare(b.title),
    ),
  );

  const columnCount = () =>
    grid.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length,
    );
  expect(await columnCount()).toBe(3);
  await page.setViewportSize({ width: 800, height: 900 });
  expect(await columnCount()).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await columnCount()).toBe(1);
});

test('contact details remain actionable in both languages', async ({ page }) => {
  await page.goto('/contact');
  const main = page.locator('main');
  const email = main.locator('a[href^="mailto:"]');
  const phone = main.locator('a[href^="tel:"]');

  await expect(email).toBeVisible();
  await expect(phone).toBeVisible();
  expect(await email.getAttribute('href')).toBe(
    `mailto:${(await email.textContent())?.trim()}`,
  );
  expect(await phone.getAttribute('href')).toBe(
    `tel:${(await phone.textContent())?.replace(/\s+/g, '')}`,
  );
  await expect(
    page.getByRole('heading', { name: 'When to reach me' }),
  ).toBeVisible();
  expect(await main.locator('ul li').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kdy mě zastihnete' }),
  ).toBeVisible();
  await expect(main.locator('li [lang="cs"]').first()).toBeVisible();
  await expect(main.locator('li [lang="en"]').first()).toBeHidden();
});

test('reduced motion exposes reveal content without animation', async ({ page }) => {
  await page.goto('/');
  const reveal = page.locator('.reveal').first();
  await expect(reveal).toBeVisible();
  expect(
    await reveal.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        opacity: style.opacity,
        transform: style.transform,
        transitionDuration: style.transitionDuration,
      };
    }),
  ).toEqual({ opacity: '1', transform: 'none', transitionDuration: '0s' });
});

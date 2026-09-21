import { expect, test } from '@playwright/test';

test('follows live system color-scheme changes without a saved choice', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('an explicit theme choice overrides later system changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle theme' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('carousel overlay controls keep their colors across page themes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  test.skip(
    (await page.locator('[data-carousel]').count()) === 0,
    'Requires at least two selected homepage images',
  );

  const overlayColors = () =>
    page.locator('[data-carousel]').evaluate((carousel) => {
      const colors = (selector: string) => {
        const style = getComputedStyle(carousel.querySelector(selector)!);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          foreground: style.color,
        };
      };
      return {
        arrow: colors('[data-carousel-next]'),
        dot: colors('[data-dot]:not([aria-current="true"])'),
        currentDot: colors('[data-dot][aria-current="true"]'),
      };
    });

  const lightColors = await overlayColors();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(await overlayColors()).toEqual(lightColors);
});

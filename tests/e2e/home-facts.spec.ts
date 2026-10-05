import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const visibleText = { useInnerText: true };

test('the facts show under their labels in order, services as one run', async ({ page }) => {
  await page.goto('/e2e/home-facts/');
  const main = page.locator('main');
  const headings = main.getByRole('heading');
  const [services, education, awards] = [0, 1, 2].map((n) => main.getByRole('list').nth(n));
  await expect(headings).toHaveText(['Services', 'Where I work', 'Education', 'Awards']);

  await expect(services.getByRole('listitem')).toHaveCount(3);
  await expect(services).toHaveText('Family houses · Renovations · Interiors', visibleText);
  await expect(main.getByText('Brno and South Moravia')).toBeVisible();
  await expect(education.getByRole('listitem')).toHaveText(
    ['FA BUT Brno, Ing. arch. (2024)', 'Doctoral study, FA BUT Brno (2027)'],
    visibleText,
  );
  await expect(awards.getByRole('listitem')).toHaveText(
    ['Young architect, 2nd place (2025)'],
    visibleText,
  );

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(headings).toHaveText(['Služby', 'Kde pracuji', 'Vzdělání', 'Ocenění']);
  await expect(services).toHaveText('Rodinné domy · Rekonstrukce · Interiéry', visibleText);
});

test('a fact left empty has no label and no element', async ({ page }) => {
  await page.goto('/e2e/home-facts-area/');
  const main = page.locator('main');
  await expect(main.getByRole('heading')).toHaveText(['Where I work']);
  await expect(main.getByRole('list')).toHaveCount(0);
});

test('with no facts filled, nothing renders', async ({ page }) => {
  await page.goto('/e2e/home-facts-empty/');
  await expect(page.locator('main > *')).toHaveCount(0);
});

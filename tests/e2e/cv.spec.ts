import { expect, test, type Page } from '@playwright/test';
import { contact, site } from './architect';

const name = `${site.credential} ${site.name}`;
const hrefs = (page: Page) =>
  page.locator('main a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));

test('the CV shows the name and profession, place, contacts and site, then the bio, experience with skills, education with degree and awards, without Approach or services', async ({ page }) => {
  await page.goto('/cs/e2e/cv/');
  const main = page.locator('main');
  await expect(main.locator('h1')).toHaveText(name);
  await expect(main.locator('header').getByText('Architektka', { exact: true })).toBeVisible();
  await expect(main.locator('address')).toContainText('Brno');
  await expect(main.locator('img')).toHaveAttribute('alt', name);
  expect(await hrefs(page)).toEqual(expect.arrayContaining([`mailto:${contact.email}`, 'tel:+420777000000', '/cs/']));
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(['Odkazy', 'O mně', 'Praxe', 'Vzdělání', 'Ocenění']);
  const text = await main.innerText();
  expect(text.indexOf('Výkres sleduje')).toBeGreaterThan(-1);
  expect(text.indexOf('Výkres sleduje')).toBeLessThan(text.search(/praxe/i));
  await expect(main.getByText('Archicad', { exact: true })).toBeVisible();
  const education = main.locator('section', { has: page.getByRole('heading', { name: 'Vzdělání' }) });
  await expect(education.getByText('Ing. arch.', { exact: true })).toBeVisible();
  for (const absent of ['Přístup', 'Služby', 'Rodinné domy']) await expect(main).not.toContainText(absent);
});

test('a bare CV shows only what is filled', async ({ page }) => {
  await page.goto('/cs/e2e/cv-bare/');
  const main = page.locator('main');
  await expect(main.locator('img')).toHaveCount(0);
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(['Odkazy', 'O mně']);
  await expect(main.locator('header').getByText('Architektka', { exact: true })).toBeVisible();
  await expect(main.locator('address')).not.toContainText('Brno');
  expect(await hrefs(page)).toEqual([`mailto:${contact.email}`, '/cs/']);
});

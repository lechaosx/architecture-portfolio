import { expect, test, type Page } from '@playwright/test';
import { contact, site } from './architect';

const name = `${site.credential} ${site.name}`;
const hrefs = (page: Page) =>
  page.locator('main a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));

test('the CV shows the name and profession, place, contacts and site, then its profile, experience with skills, education with degree, chosen projects and awards, without the bio, Approach or services', async ({ page }) => {
  await page.goto('/cs/e2e/cv/');
  const main = page.locator('main');
  await expect(main.locator('h1')).toHaveText(name);
  await expect(main.locator('header').getByText('Architektka', { exact: true })).toBeVisible();
  await expect(main.locator('address')).toContainText('Brno');
  await expect(main.locator('img')).toHaveAttribute('alt', name);
  expect(await hrefs(page)).toEqual(expect.arrayContaining([`mailto:${contact.email}`, 'tel:+420777000000', '/cs/']));
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(['Odkazy', 'Vybrané projekty', 'Výstavy a publikace', 'Zájmy', 'O mně', 'Praxe', 'Vzdělání', 'Ocenění']);
  const text = await main.innerText();
  expect(text.indexOf('Navrhuji domy')).toBeGreaterThan(-1);
  expect(text.indexOf('Navrhuji domy')).toBeLessThan(text.search(/praxe/i));
  await expect(main.getByText('Archicad', { exact: true })).toBeVisible();
  const education = main.locator('section', { has: page.getByRole('heading', { name: 'Vzdělání' }) });
  await expect(education.getByText('Ing. arch.', { exact: true })).toBeVisible();
  for (const absent of ['Text pro stránku O mně', 'Přístup', 'Služby', 'Rodinné domy']) await expect(main).not.toContainText(absent);
});

test('the CV fills its optional sections: headline, links after the site, exhibitions with their notes, and interests', async ({ page }) => {
  await page.goto('/cs/e2e/cv/');
  const main = page.locator('main');
  await expect(main.locator('header').getByText('Stavby od první studie po realizaci')).toBeVisible();
  const section = (name: string) => main.locator('section', { has: page.getByRole('heading', { name }) });
  await expect(section('Odkazy').getByRole('link')).toHaveText(['kalabkova.cz', 'linkedin.com/in/klara-svobodova', 'klara.example.org']);
  await expect(section('Odkazy').getByRole('link').nth(1)).toHaveAttribute('href', 'https://www.linkedin.com/in/klara-svobodova');
  const exhibitions = section('Výstavy a publikace');
  await expect(exhibitions.getByRole('link', { name: 'Výstava diplomových prací' })).toHaveAttribute('href', 'https://example.org/vystava');
  await expect(exhibitions).toContainText('Kyjov, 2025');
  await expect(exhibitions.getByText('Rozhovor v časopise')).toBeVisible();
  await expect(section('Zájmy').getByRole('listitem')).toHaveText(['Turistika', 'Kresba']);
});

test('the CV lists the projects chosen for the landing page in that order, each with its place, period and my roles, linking its page', async ({ page }) => {
  await page.goto('/cs/e2e/cv/');
  const projects = page.locator('main section', { has: page.getByRole('heading', { name: 'Vybrané projekty' }) });
  const links = projects.getByRole('link');
  await expect(links).toHaveText(['Projekt 2024', 'Testovací projekt', 'Projekt 2023']);
  expect(await links.evaluateAll((items) => items.map((link) => link.getAttribute('href')))).toEqual([
    '/cs/projects/e2e-2024/', '/cs/projects/e2e-grid/', '/cs/projects/e2e-2023/',
  ]);
  const first = projects.getByRole('listitem').first();
  for (const fact of ['Nikde', '2024', 'Návrh interiéru', 'Dokumentace']) await expect(first).toContainText(fact);
});

test('a bare CV shows only what is filled', async ({ page }) => {
  await page.goto('/cs/e2e/cv-bare/');
  const main = page.locator('main');
  await expect(main.locator('img')).toHaveCount(0);
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(['Odkazy']);
  await expect(main.locator('header').getByText('Architektka', { exact: true })).toBeVisible();
  await expect(main.locator('address')).not.toContainText('Brno');
  await expect(main).not.toContainText('Výkres sleduje');
  expect(await hrefs(page)).toEqual([`mailto:${contact.email}`, '/cs/']);
});

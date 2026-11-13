import { expect, test } from '@playwright/test';
import { contact, site } from './architect';

const heading = { cs: 'Právní informace', en: 'Legal information' };

const businessDetails = {
  cs: { ico: `IČO: ${contact.ico}`, seat: `Sídlo: ${contact.seat}`, registration: 'Fyzická osoba zapsaná v živnostenském rejstříku' },
  en: { ico: `Business ID: ${contact.ico}`, seat: `Registered office: ${contact.seat}`, registration: 'Sole trader registered in the Czech Trade Register' },
};

test('the legal page opens with her business details, then names her as controller and the consumer dispute body, in the visitor’s language', async ({ page }) => {
  await page.goto('/e2e/legal/');
  const main = page.locator('main');
  for (const lang of ['en', 'cs'] as const) {
    if (lang === 'cs') await page.getByRole('link', { name: 'Switch to Czech' }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading[lang] })).toBeAttached();
    const name = main.getByText(site.name, { exact: true });
    await expect(name).toBeVisible();
    for (const line of Object.values(businessDetails[lang])) {
      const detail = main.getByText(line, { exact: true });
      await expect(detail).toBeVisible();
      expect((await detail.boundingBox())!.y).toBeGreaterThan((await name.boundingBox())!.y);
    }
    await expect(main.getByRole('link', { name: contact.email })).toHaveAttribute('href', `mailto:${contact.email}`);
    await expect(main).toContainText(lang === 'cs' ? 'Česká obchodní inspekce' : 'Czech Trade Inspection Authority');
    await expect(main.getByRole('link', { name: /^coi\.gov\.cz\// })).toHaveAttribute('href', /^https:\/\/coi\.gov\.cz\//);
  }
});

test('the legal texts read in one column even when long enough for two', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/e2e/legal/');
  for (const lang of ['en', 'cs'] as const) {
    if (lang === 'cs') await page.getByRole('link', { name: 'Switch to Czech' }).click();
    const lefts = await page.locator('main .prose p').evaluateAll((all) => all.map((p) => Math.round(p.getBoundingClientRect().x)));
    expect(new Set(lefts).size, lang).toBe(1);
  }
});

test('a long seat wraps within a phone’s width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/e2e/legal/');
  await expect(page.locator('main').getByText(businessDetails.en.seat, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('the legal page leaves out the IČO, trade registration and seat when they are not filled', async ({ page }) => {
  await page.goto('/e2e/legal-bare/');
  const main = page.locator('main');
  for (const lang of ['en', 'cs'] as const) {
    if (lang === 'cs') await page.getByRole('link', { name: 'Switch to Czech' }).click();
    await expect(main.getByText(site.name, { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: contact.email })).toBeVisible();
    await expect(main).not.toContainText(/IČO|Business ID|sídl|registered office|rejstřík|register|undefined/i);
  }
});

test('without an IČO, the legal page keeps the seat but leaves out the trade registration and the consumer dispute notice', async ({ page }) => {
  await page.goto('/e2e/legal-seat/');
  const main = page.locator('main');
  for (const lang of ['en', 'cs'] as const) {
    if (lang === 'cs') await page.getByRole('link', { name: 'Switch to Czech' }).click();
    await expect(main.getByText(site.name, { exact: true })).toBeVisible();
    await expect(main.getByText(businessDetails[lang].seat, { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: contact.email })).toBeVisible();
    await expect(main).not.toContainText(/IČO|Business ID|rejstřík|trade register|spotřebitel|consumer|inspekce|inspection|coi\.gov|undefined/i);
  }
});

test('the footer links to the legal page in the visitor’s language', async ({ page }) => {
  await page.goto('/e2e/work/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: heading.en })).toHaveAttribute('href', '/en/legal/');
  await page.getByRole('link', { name: 'Switch to Czech' }).click();
  // The shipped page: only its heading is the same whatever the content.
  await footer.getByRole('link', { name: heading.cs }).click();
  await expect(page).toHaveURL(/\/cs\/legal\/$/);
  await expect(page.getByRole('heading', { level: 1, name: heading.cs })).toBeAttached();
});

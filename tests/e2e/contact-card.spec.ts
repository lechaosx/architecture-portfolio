import { expect, test, type Page } from '@playwright/test';

// The landing fixtures in tests/e2e/pages/[fixture].astro: every contact line
// filled, and in the bare one only the email and a Czech-only place.
const card = (page: Page) =>
  page.locator('main section', {
    has: page.getByRole('heading', { level: 2, name: /^(Contact|Kontakt)$/ }),
  });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the contact card invites an enquiry and lists how and when to reach her', async ({ page }) => {
  await page.goto('/e2e/landing/');
  await expect(card(page).getByText('Let’s give your project shape.')).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Write an email ↗' })).toHaveAttribute(
    'href',
    'mailto:jana@example.cz',
  );
  const contacts = card(page).locator('address');
  await expect(contacts.getByRole('link', { name: 'jana@example.cz' })).toHaveAttribute(
    'href',
    'mailto:jana@example.cz',
  );
  await expect(contacts.getByRole('link', { name: '+420 777 000 000' })).toHaveAttribute(
    'href',
    'tel:+420777000000',
  );
  await expect(contacts.getByText('Mon–Fri 9–17')).toBeVisible();
  await expect(contacts.getByText('Brno', { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Kontakt');
  await expect(contacts.getByText('Po–Pá 9–17')).toBeVisible();
});

test('call hours sit under the phone, every contact icon on one left edge', async ({ page }) => {
  await page.goto('/e2e/landing/');
  const contacts = card(page).locator('address');
  const phone = (await contacts.getByRole('link', { name: '+420 777 000 000' }).boundingBox())!;
  const hours = (await contacts.getByText('Mon–Fri 9–17').boundingBox())!;
  expect(hours.y).toBeGreaterThanOrEqual(phone.y + phone.height);
  expect(hours.x).toBeCloseTo(phone.x, 0);
  const icons = await contacts
    .locator('svg')
    .evaluateAll((svgs) => svgs.map((svg) => Math.round(svg.getBoundingClientRect().x)));
  expect(icons).toHaveLength(4);
  expect(new Set(icons).size).toBe(1);
});

test('a contact line filled in one language shows only in that language', async ({ page }) => {
  await page.goto('/e2e/landing-bare/');
  const contacts = card(page).locator('address');
  await expect(contacts.getByRole('link', { name: 'jana@example.cz' })).toBeVisible();
  await expect(contacts.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(contacts.getByText('Brno', { exact: true })).toBeVisible();
  await expect(contacts.getByRole('listitem')).toHaveCount(2);
});

test('the enquiry sits beside the invitation on wide screens and under it on phones', async ({
  page,
}) => {
  await page.goto('/e2e/landing/');
  const heading = card(page).getByText('Let’s give your project shape.');
  const enquiry = card(page).getByRole('link', { name: 'Write an email ↗' });

  await page.setViewportSize({ width: 1280, height: 900 });
  let [h, e] = await Promise.all([heading, enquiry].map(async (l) => (await l.boundingBox())!));
  expect(e.x).toBeGreaterThan(h.x + h.width);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    [h, e] = await Promise.all([heading, enquiry].map(async (l) => (await l.boundingBox())!));
    expect(e.y, `${width}px`).toBeGreaterThan(h.y + h.height);
    expect(e.x, `${width}px`).toBeCloseTo(h.x, 0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px`,
    ).toBe(true);
  }
});

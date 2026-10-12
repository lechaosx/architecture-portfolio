import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const route of ['/single-page/']) {
test(`the introduction leads to work and a direct project enquiry: ${route}`, async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Architecture for everyday life.');
  await page.getByRole('link', { name: 'Explore the work ↓' }).click();
  await expect(page).toHaveURL(`${page.url().split('#')[0]}#work`);
  const projects = page.locator('#work a[href^="/projects/"]');
  expect(await projects.count()).toBeGreaterThan(0);
  const href = await projects.first().getAttribute('href');
  const destination = new URL(href!, page.url()).href;
  await projects.first().click();
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto(route);
  await page.getByRole('link', { name: 'Discuss your project →', exact: true }).first().click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator('#contact a[href^="mailto:"]').first()).toHaveAttribute('href', 'mailto:info@kalabkova.cz');
});
}

test('the menu navigates within the overview and the wordmark returns to its beginning', async ({ page }) => {
  await page.goto('/single-page/');
  await page.locator('header').getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/single-page\/#about$/);
  await expect(page.locator('header').getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(page.getByRole('heading', { level: 2, name: 'About', exact: true })).toBeInViewport();
  await page.getByRole('link', { name: 'Discuss your project →', exact: true }).first().click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator('#contact a[href^="mailto:"]').first()).toBeInViewport();
  await page.locator('header').getByRole('link', { name: /Tereza Kalábková/i }).click();
  await expect(page).toHaveURL(/\/single-page\/$/);
});

test('the single page includes every project, including projects without images', async ({ page }) => {
  await page.goto('/e2e/single-page-work/');
  const work = page.locator('#work');
  await expect(work.getByRole('heading', { level: 2 })).toHaveText('Work');
  await expect(work.getByRole('heading', { level: 3 })).toHaveText([
    'Project 2027', 'Project 2026', 'Project 2025', 'Project 2024',
    'Text-only project', 'Brief-only project',
  ]);
  await expect(work.getByRole('link', { name: /Text-only project/ })).toHaveAttribute('href', '/projects/fixture-text/');
  await expect(work.getByRole('link', { name: /Brief-only project/ })).toHaveCount(0);
  await expect(work.getByText('The brief.', { exact: true })).toBeVisible();
  await expect(work.getByRole('link', { name: 'All work →' })).toHaveCount(0);
});

test('the main section headings match the menu and the CV belongs to About', async ({ page }) => {
  for (const route of ['/single-page/']) {
    await page.goto(route);
    for (const [id, label] of [['work', 'Work'], ['about', 'About'], ['contact', 'Contact']]) {
      await expect(page.locator(`#${id}`).getByRole('heading', { level: 2, name: label, exact: true })).toBeVisible();
    }
  }
  await page.goto('/single-page/');
  for (const name of ['Approach', 'Education']) {
    await expect(page.locator('#about').getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
});

test('the proposal uses the existing Approach without an added process section', async ({ page }) => {
  for (const route of ['/single-page/']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'From the first idea to realisation.', exact: true })).toHaveCount(0);
  }
  await page.goto('/single-page/');
  await expect(page.getByRole('heading', { name: 'Approach', exact: true })).toBeVisible();
});

test('hours describe when phone calls are received', async ({ page }) => {
  for (const route of ['/single-page/', '/about/']) {
    await page.goto(route);
    if (await page.locator('html').getAttribute('data-lang') !== 'en') {
      await page.locator('[data-lang-toggle]').click();
    }
    const phone = page.locator('main address').getByRole('link', { name: '+420 777 123 456', exact: true });
    await expect(phone.locator('..')).toContainText('Mon–Fri 10–15', { useInnerText: true });
    await expect(page.getByText('Calls:', { exact: true })).toHaveCount(0);
    await page.locator('[data-lang-toggle]').click();
    await expect(page.getByText('Hovory:', { exact: true })).toHaveCount(0);
  }
});

test('section scrolling follows the visitor’s motion preference', async ({ page }) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/single-page/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const motion = await page.evaluate(async () => {
      const samples: number[] = [];
      document.querySelector<HTMLAnchorElement>('header a[href="#work"]')!.click();
      const hash = location.hash;
      const start = performance.now();
      while (performance.now() - start < 900) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(scrollY);
      }
      return { hash, positions: new Set(samples).size, final: samples.at(-1)! };
    });
    expect(motion.hash).toBe('#work');
    expect(motion.final).toBeGreaterThan(0);
    if (reducedMotion === 'no-preference') expect(motion.positions).toBeGreaterThan(2);
    else expect(motion.positions).toBe(1);
  }
});

test('both languages and themes remain usable on narrow phones and tablets', async ({ page }) => {
  for (const route of ['/single-page/']) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Nothing stands on this plot.');
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ['en', 'cs']) {
        if (await page.locator('html').getAttribute('data-lang') !== lang) {
          await page.locator('[data-lang-toggle]').click();
        }
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}px ${lang}`).toBe(true);
        await page.locator('[data-theme-toggle]').click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} dark/light ${width}px ${lang}`).toBe(true);
      }
    }
  }
});

test('the CV entries are visible without opening a disclosure', async ({ page }) => {
  for (const route of ['/single-page/']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Education', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Architecture and Urban Development', exact: true })).toBeVisible();
    await expect(page.getByText('2024–2026', { exact: true })).toBeVisible();
  }
});

test('manual scrolling highlights the current section in the single-page header', async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/single-page/');
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(Math.min(300, width - 40), 400);
    const header = page.locator('header');
    for (const [id, name] of [['work', 'Work'], ['about', 'About'], ['contact', 'Contact'], ['work', 'Work']]) {
      // Browsers limit wheel distance differently, so keep scrolling until arrival.
      await expect(async () => {
        const target = (await page.locator(`#${id}`).boundingBox())!;
        const bar = (await header.boundingBox())!;
        await page.mouse.wheel(0, target.y - bar.y - bar.height);
        expect(await header.getByRole('link', { name, exact: true }).getAttribute('aria-current')).toBe('location');
      }).toPass({ timeout: 5000, intervals: [50] });
      await expect(header.locator('[aria-current]')).toHaveCount(1);
    }
  }
});

test('a menu click highlights its destination immediately throughout smooth scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  await page.goto('/single-page/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const selection = await page.evaluate(async () => {
    const link = document.querySelector<HTMLAnchorElement>('header a[href="#contact"]')!;
    link.click();
    const immediate = { current: link.getAttribute('aria-current'), background: getComputedStyle(link).backgroundColor };
    const highlights: (string | null)[] = [];
    const positions: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 1100) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      highlights.push(document.querySelector('header [aria-current]')?.getAttribute('href') ?? null);
      positions.push(scrollY);
    }
    return { immediate, highlights: [...new Set(highlights)], positions: new Set(positions).size };
  });
  expect(selection.immediate).toEqual({ current: 'location', background: 'rgb(0, 0, 0)' });
  expect(selection.highlights).toEqual(['#contact']);
  expect(selection.positions).toBeGreaterThan(2);
});

test('a new destination supersedes an ongoing scroll and manual scrolling regains the highlight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/single-page/', { waitUntil: 'networkidle' });
  const selection = await page.evaluate(async () => {
    document.querySelector<HTMLAnchorElement>('header a[href="#contact"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const link = document.querySelector<HTMLAnchorElement>('header a[href="#work"]')!;
    link.click();
    const immediate = link.getAttribute('aria-current');
    const highlights: (string | null)[] = [];
    const start = performance.now();
    while (performance.now() - start < 900) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      highlights.push(document.querySelector('header [aria-current]')?.getAttribute('href') ?? null);
    }
    return { immediate, highlights: [...new Set(highlights)] };
  });
  expect(selection).toEqual({ immediate: 'location', highlights: ['#work'] });
  const header = page.locator('header');
  await page.mouse.move(300, 400);
  await page.evaluate(() => document.querySelector<HTMLAnchorElement>('header a[href="#contact"]')!.click());
  await expect(header.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('aria-current', 'location');
  await page.mouse.wheel(0, 1);
  await page.evaluate(() => document.getElementById('work')!.scrollIntoView({ behavior: 'instant' }));
  await expect(header.getByRole('link', { name: 'Work', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(header.locator('[aria-current]')).toHaveCount(1);
});

test('Contact joins the original menu styling and follows the current section', async ({ page }) => {
  await page.goto('/single-page/');
  const header = page.locator('header');
  await expect(header.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('href', '#contact');
  await header.getByRole('link', { name: 'About', exact: true }).click();
  await expect(header.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'location');
  await header.getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(header.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(header.locator('[aria-current]')).toHaveCount(1);
});

test('Back restores the previous section during an ongoing scroll', async ({ page }) => {
  await page.goto('/single-page/', { waitUntil: 'networkidle' });
  const header = page.locator('header');
  await header.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page.locator('#work').getByRole('heading', { level: 2, name: 'Work', exact: true })).toBeInViewport();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.querySelector<HTMLAnchorElement>('header a[href="#contact"]')!.click());
  await page.goBack();
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator('#work').getByRole('heading', { level: 2, name: 'Work', exact: true })).toBeInViewport();
  await expect(header.getByRole('link', { name: 'Work', exact: true })).toHaveAttribute('aria-current', 'location');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the Czech introduction and enquiry are accessible', async ({ page }) => {
    await page.goto('/single-page/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Architektura pro každodenní život.');
    await expect(page.locator('#contact a[href^="mailto:"]').first()).toBeVisible();
  });
});
test('the review proposal opens directly at its unlisted address', async ({ page, request }) => {
  const response = await page.goto('/single-page/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Architecture for everyday life.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('header a[href="#work"]')).toBeVisible();
  await expect(page.locator('header a[href="#about"]')).toBeVisible();
  await expect(page.locator('header a[href="#contact"]')).toBeVisible();
  expect(await (await request.get('/sitemap-0.xml')).text()).not.toContain('/single-page/');
});

test('normal pages do not link to the review proposal', async ({ page }) => {
  for (const route of ['/', '/work/', '/about/']) {
    await page.goto(route);
    await expect(page.locator('a[href^="/single-page"]')).toHaveCount(0);
    await expect(page.locator('header nav li')).toHaveText(['Work', 'About'], { useInnerText: true, ignoreCase: true });
  }
});

test('the comparison and separate-page experiment addresses are removed', async ({ request }) => {
  for (const route of ['/experiment/', '/experiment/pages/', '/experiment/pages/about/']) {
    expect((await request.get(route)).status()).toBe(404);
  }
});

test('the opening image introduces the work without duplicate project navigation', async ({ page }) => {
  await page.goto('/single-page/');
  await page.locator('main img').first().click();
  await expect(page).toHaveURL(/\/single-page\/$/);
  await page.getByRole('link', { name: 'Explore the work ↓' }).click();
  await expect(page).toHaveURL(/#work$/);
  await page.locator('#work a[href^="/projects/"]').first().click();
  await expect(page).toHaveURL(/\/projects\/.+\/$/);
});

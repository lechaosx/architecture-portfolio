import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';

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

test.describe(() => {
  test.use({ locale: 'cs-CZ' });

  test('language follows the saved choice, else the browser, and ignores ?lang=', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { name: 'O mně' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBeNull();

    await page.getByRole('button', { name: 'Přepnout do angličtiny' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page).toHaveTitle(/Architecture/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /architect/i,
    );

    await page.goto('/contact/?lang=cs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', { name: 'When to reach me' }),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');
  });
});

test('tab titles name the page and the credentialed architect in both languages', async ({
  page,
}) => {
  const site = parse(
    readFileSync('src/content/singletons/site.md', 'utf8').split('---')[1],
  );
  const owner = [site.credential, site.name].filter(Boolean).join(' ');
  const titles = [
    ['/', `${owner} | Architecture`, `${owner} | Architektura`],
    ['/work/', `Work | ${owner}`, `Práce | ${owner}`],
    ['/contact/', `Contact | ${owner}`, `Kontakt | ${owner}`],
    // tests/e2e/pages/[fixture].astro, which the e2e build adds.
    ['/e2e/project/', `Test project | ${owner}`, `Testovací projekt | ${owner}`],
  ];
  await page.goto('/');
  for (const [path, en, cs] of titles) {
    await page.evaluate(() => localStorage.setItem('lang', 'en'));
    await page.goto(path);
    await expect(page).toHaveTitle(en);
    await page.evaluate(() => localStorage.setItem('lang', 'cs'));
    await page.goto(path);
    await expect(page).toHaveTitle(cs);
  }
});

test.describe(() => {
  test.use({ colorScheme: 'dark' });

  test('theme follows the system and an explicit choice persists across navigation', async ({
    page,
  }) => {
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

    await page.goto('/work/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test('footer toggles share dimensions and show the state they switch to', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  const theme = page.locator('[data-theme-toggle]');
  const language = page.locator('[data-lang-toggle]');
  const [themeBox, languageBox] = await Promise.all([
    theme.boundingBox(),
    language.boundingBox(),
  ]);
  expect({ width: languageBox!.width, height: languageBox!.height }).toEqual({
    width: themeBox!.width,
    height: themeBox!.height,
  });

  await expect(theme.locator('.theme-icon-moon')).toHaveCSS('opacity', '1');
  await expect(theme.locator('.theme-icon-sun')).toHaveCSS('opacity', '0');
  await expect(language.locator('.language-option-cs')).toHaveCSS('opacity', '1');
  await expect(language.locator('.language-option-en')).toHaveCSS('opacity', '0');

  await theme.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme.locator('.theme-icon-moon')).toHaveCSS('opacity', '0');
  await expect(theme.locator('.theme-icon-sun')).toHaveCSS('opacity', '1');

  await language.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(language.locator('.language-option-cs')).toHaveCSS('opacity', '0');
  await expect(language.locator('.language-option-en')).toHaveCSS('opacity', '1');
});

test('work projects are sorted and the grid follows its responsive breakpoints', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/work/');
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
  await page.goto('/contact/');
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
  await expect(main.locator('ul li')).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kdy mě zastihnete' }),
  ).toBeVisible();
  await expect(main.locator('li [lang="cs"]').first()).toBeVisible();
  await expect(main.locator('li [lang="en"]').first()).toBeHidden();
});

test('prose is justified and hyphenates according to its language', async ({
  page,
}) => {
  await page.goto('/');
  const prose = page.locator('.prose');

  expect(
    await prose.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          lang: element.getAttribute('lang'),
          textAlign: style.textAlign,
          hyphens: style.hyphens,
        };
      }),
    ),
  ).toEqual([
    { lang: 'cs', textAlign: 'justify', hyphens: 'auto' },
    { lang: 'en', textAlign: 'justify', hyphens: 'auto' },
  ]);
});

test('project prose fills the available width with comfortable columns', async ({
  page,
}) => {
  await page.goto('/e2e/project/');
  await page.evaluate(() => document.fonts.ready);

  for (const lang of ['en', 'cs']) {
    if (lang === 'cs') {
      await page.getByRole('button', { name: 'Switch to Czech' }).click();
    }
    const prose = page.locator(`article .prose[lang="${lang}"]`).first();
    await expect(prose).toBeVisible();

    for (const fontSize of [16, 20]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}px`;
      }, fontSize);
      const { minimumColumnWidth, gap, padding } = await prose.evaluate((element) => {
        const measure = document.createElement('div');
        measure.style.cssText = 'position:absolute; width:35ch; visibility:hidden';
        element.append(measure);
        const minimumColumnWidth = measure.getBoundingClientRect().width;
        measure.remove();
        const article = getComputedStyle(element.closest('article')!);
        return {
          minimumColumnWidth,
          gap: parseFloat(getComputedStyle(element).columnGap),
          padding: parseFloat(article.paddingLeft) + parseFloat(article.paddingRight),
        };
      });
      const splitWidth = 2 * minimumColumnWidth + gap + padding;

      for (const [width, columns] of [
        [900, 900 < splitWidth ? 1 : 2],
        [390, 1],
        [700, 1],
        [Math.floor(splitWidth) - 2, 1],
        [Math.ceil(splitWidth) + 2, 2],
        [1023, 2],
        [1024, 2],
        [1280, 2],
      ]) {
        await page.setViewportSize({ width, height: 900 });
        const cover = await page.locator('.project-cover').boundingBox();
        const layout = await prose.evaluate((element) => {
          const columns = Array.from(element.querySelector('p')!.getClientRects());
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            width: box.width,
            columns: columns.length,
            columnWidth: Math.min(...columns.map((column) => column.width)),
          };
        });

        const context = `${lang}, font ${fontSize}, viewport ${width}`;
        expect(layout.left, context).toBeCloseTo(cover!.x);
        expect(layout.width, context).toBeCloseTo(cover!.width);
        expect(layout.columns, context).toBe(columns);
        if (layout.columns > 1) {
          expect(layout.columnWidth, context).toBeGreaterThanOrEqual(minimumColumnWidth);
        }
      }
    }
  }
});

test('reduced motion exposes reveal content without animation', async ({ page }) => {
  await page.goto('/');
  // Starts off screen, so the script hides it once it has observed it.
  const reveal = page.locator('.reveal').last();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
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

test('reduced motion keeps project images still on hover', async ({ page }) => {
  await page.goto('/e2e/project/');
  const variants = {
    cover: page.locator('.project-cover'),
    'gallery thumbnail': page.locator('.grid > [data-lightbox-index]').first(),
    // The fixture's second full-width set, after the cover and its galleries.
    'single-image set': page.locator('button[data-lightbox-index="21"]'),
  };

  for (const button of Object.values(variants)) {
    const image = button.locator('img');
    await button.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const before = await image.boundingBox();
    await button.hover();
    await page.waitForTimeout(100);
    expect(await image.boundingBox()).toEqual(before);
  }
});

test.describe(() => {
  test.use({ javaScriptEnabled: false });

  test('reveal content is visible without JavaScript', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const path of ['/', '/contact/']) {
      await page.goto(path);
      const opacities = await page
        .locator('.reveal')
        .evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).opacity),
        );
      expect(opacities.length).toBeGreaterThan(0);
      expect(opacities.every((opacity) => opacity === '1')).toBe(true);
    }
  });
});

test('reveal content on screen at load shows without a fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const faded = new Set<Element>();
    addEventListener('transitionrun', (event) => faded.add(event.target as Element), true);
    Object.assign(window, { faded });
  });
  for (const path of ['/', '/contact/']) {
    await page.setViewportSize({ width: 1280, height: path === '/' ? 1600 : 720 });
    await page.goto(path);
    await page.waitForTimeout(1000);
    const onScreen = await page.locator('.reveal').evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().top < innerHeight)
        .map((element) => ({
          faded: (window as unknown as { faded: Set<Element> }).faded.has(element),
          opacity: getComputedStyle(element).opacity,
        })),
    );
    expect(onScreen.length).toBeGreaterThan(0);
    expect(onScreen).toEqual(onScreen.map(() => ({ faded: false, opacity: '1' })));
  }
});

test('reveal content fades in as soon as it enters the viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const reveal = page.locator('.reveal').last();
  const opacity = () => reveal.evaluate((element) => getComputedStyle(element).opacity);
  expect(
    await reveal.evaluate((element) => element.getBoundingClientRect().top > innerHeight),
  ).toBe(true);
  await expect.poll(opacity).toBe('0');

  await reveal.evaluate((element) =>
    scrollBy(0, element.getBoundingClientRect().top - innerHeight + 0.05 * innerHeight),
  );
  await expect.poll(opacity).toBe('1');
});

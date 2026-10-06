import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import { parse } from 'yaml';

const site = parse(
  readFileSync('src/content/singletons/site.md', 'utf8').split('---')[1],
);
const contact = parse(
  readFileSync('src/content/singletons/contact.md', 'utf8').split('---')[1],
);
const owner = [site.credential, site.name].filter(Boolean).join(' ');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the bare domain forwards to the work page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/work\/$/);
  await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
});

test('primary navigation reaches every page and marks the current section', async ({
  page,
}) => {
  await page.goto('/work/');
  const workLink = page.getByRole('link', { name: 'Work', exact: true });
  const aboutLink = page.getByRole('link', { name: 'About', exact: true });
  await expect(page.locator('header nav li')).toHaveText(['Work', 'About'], {
    useInnerText: true,
    ignoreCase: true,
  });
  await expect(workLink).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();

  await page.locator('main section.grid > a').first().click();
  await expect(page).toHaveURL(/\/projects\/.+\/$/);
  await page.getByRole('link', { name: 'Back to work' }).click();
  await expect(page).toHaveURL(/\/work\/$/);

  await aboutLink.click();
  await expect(page).toHaveURL(/\/about\/$/);
  await expect(aboutLink).toHaveAttribute('aria-current', 'page');
  await expect(workLink).not.toHaveAttribute('aria-current');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approach' })).toBeVisible();

  await page.locator('header nav > a').first().click();
  await expect(page).toHaveURL(/\/work\/$/);
});

test('the work page opens with the site description', async ({ page }) => {
  await page.goto('/work/');
  const intro = page.locator('main h1 ~ p:visible');
  await expect(intro).toHaveText(site.description_en);
  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(intro).toHaveText(site.description_cs);
});

test('an unknown address shows the not-found page with the menu', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Nothing stands on this plot.' }),
  ).toBeVisible();
  await expect(page.getByText('Are you sure you have the right address?')).toBeVisible();
  await expect(page.locator('header nav li')).toHaveText(['Work', 'About'], {
    useInnerText: true,
    ignoreCase: true,
  });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page).toHaveTitle(`Page not found | ${owner}`);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(page.getByRole('heading', { name: 'Na této parcele nic nestojí.' })).toBeVisible();
  await expect(page).toHaveTitle(`Stránka nenalezena | ${owner}`);
  await page.getByRole('link', { name: 'Zpátky do ateliéru' }).click();
  await expect(page).toHaveURL(/\/work\/$/);
});

test.describe(() => {
  test.use({ locale: 'cs-CZ' });

  test('language follows the saved choice, else the browser, and ignores ?lang=', async ({
    page,
  }) => {
    await page.goto('/about/?lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { name: 'O mně' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBeNull();

    await page.getByRole('button', { name: 'Přepnout do angličtiny' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page).toHaveTitle(`About | ${owner}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /architect/i,
    );

    await page.goto('/work/?lang=cs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en');
  });
});

test.describe(() => {
  test.use({ locale: 'en-US' });

  test('an English browser gets English over the Czech static default', async ({ page }) => {
    await page.goto('/work/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
    await expect(page).toHaveTitle(`${owner} | Architect`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      site.description_en,
    );
  });

  test('the tab title is in the visitor language before deferred scripts run', async ({
    page,
  }) => {
    // Parsing ends with readyState "interactive"; deferred and module scripts
    // run only after it.
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') {
          Object.assign(window, { titleWhenParsed: document.title });
        }
      });
    });
    await page.goto('/work/');
    expect(
      await page.evaluate(() => (window as unknown as { titleWhenParsed: string }).titleWhenParsed),
    ).toBe(`${owner} | Architect`);
  });
});

test('tab titles name the page and the credentialed architect in both languages', async ({
  page,
}) => {
  const titles = [
    ['/work/', `${owner} | Architect`, `${owner} | Architektka`],
    ['/about/', `About | ${owner}`, `O mně | ${owner}`],
    // tests/e2e/pages/[fixture].astro, which the e2e build adds.
    ['/e2e/project/', `Test project | ${owner}`, `Testovací projekt | ${owner}`],
  ];
  await page.goto('/work/');
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
    await page.goto('/about/');

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
  await page.goto('/work/');

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
      title: element.querySelector('h2[lang="en"]')?.textContent?.trim() ?? '',
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

test('the footer links its contacts, in a row on wide screens and stacked on phones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/work/');
  const footer = page.locator('footer');
  const email = footer.getByRole('link', { name: contact.email });
  const phone = footer.getByRole('link', { name: contact.phone });
  const hours = footer.getByText(contact.hours_en);
  const copyright = footer.getByText(`© ${new Date().getFullYear()} ${site.name}`);
  const middle = async (item: Locator) => {
    const box = (await item.boundingBox())!;
    return Math.round(box.y + box.height / 2);
  };

  await expect(email).toHaveAttribute('href', `mailto:${contact.email}`);
  await expect(phone).toHaveAttribute('href', `tel:${contact.phone.replace(/\s+/g, '')}`);
  await expect(hours).toBeVisible();
  expect(new Set(await Promise.all([email, phone, hours].map(middle))).size).toBe(1);

  await page.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(footer.getByText(contact.hours_cs)).toBeVisible();
  await expect(hours).toBeHidden();

  await page.setViewportSize({ width: 390, height: 800 });
  const [e, p, h, c, first] = await Promise.all(
    [
      email,
      phone,
      footer.getByText(contact.hours_cs),
      copyright,
      footer.getByRole('listitem').first(),
    ].map((item) => item.boundingBox()),
  );
  expect(p!.y).toBeGreaterThan(e!.y + e!.height - 1);
  expect(h!.y).toBeGreaterThan(p!.y + p!.height - 1);
  expect(p!.x).toBeCloseTo(e!.x);
  expect(h!.x).toBeCloseTo(e!.x);
  expect(c!.x, 'left-aligned, not centred').toBeCloseTo(first!.x);
  await expect(footer.getByRole('heading')).toHaveCount(0);
});

test('the footer fits a 320px phone, its bottom row on one line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/work/');
  const footer = page.locator('footer');
  const middles = await Promise.all(
    [
      footer.getByText(`© ${new Date().getFullYear()} ${site.name}`),
      footer.getByRole('button', { name: 'Switch to Czech' }),
    ].map(async (item) => {
      const box = (await item.boundingBox())!;
      return Math.round(box.y + box.height / 2);
    }),
  );
  expect(new Set(middles).size).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('the wordmark and menu fit a 320px phone, each menu item on one line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/about/');
  for (const lang of ['en', 'cs']) {
    if (lang === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    const lines = await page
      .locator('header nav li span:visible')
      .evaluateAll((items) => items.map((item) => item.getClientRects().length));
    expect(lines, lang).toEqual([1, 1]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      lang,
    ).toBe(true);
  }
});

test('no footer contact breaks inside on phones', async ({ page }) => {
  await page.goto('/work/');
  const footer = page.locator('footer');
  for (const [lang, hours] of [
    ['en', contact.hours_en],
    ['cs', contact.hours_cs],
  ]) {
    if (lang === 'cs') await page.getByRole('button', { name: 'Switch to Czech' }).click();
    for (const width of [390, 375, 360]) {
      await page.setViewportSize({ width, height: 700 });
      for (const text of [contact.email, contact.phone, hours]) {
        const lines = await footer
          .getByText(text, { exact: true })
          .evaluate((element) => element.getClientRects().length);
        expect(lines, `${text} in ${lang} at ${width}px`).toBe(1);
      }
    }
  }
});

test('prose is justified and hyphenates according to its language', async ({
  page,
}) => {
  await page.goto('/about/');
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
  await page.goto('/about/');
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

  test('the static page is Czech, as crawlers and link previews read it', async ({ page }) => {
    await page.goto('/work/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { name: 'Práce' })).toBeVisible();
    await expect(page).toHaveTitle(`${owner} | Architektka`);
    const meta = (selector: string) => page.locator(`meta[${selector}]`);
    await expect(meta('name="description"')).toHaveAttribute('content', site.description_cs);
    await expect(meta('property="og:title"')).toHaveAttribute('content', `${owner} | Architektka`);
    await expect(meta('property="og:description"')).toHaveAttribute(
      'content',
      site.description_cs,
    );
  });

  test('reveal content is visible without JavaScript', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/about/');
    const opacities = await page
      .locator('.reveal')
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).opacity),
      );
    expect(opacities.length).toBeGreaterThan(0);
    expect(opacities.every((opacity) => opacity === '1')).toBe(true);
  });
});

test('reveal content on screen at load shows without a fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const faded = new Set<Element>();
    addEventListener('transitionrun', (event) => faded.add(event.target as Element), true);
    Object.assign(window, { faded });
  });
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto('/about/');
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
});

test('reveal content fades in as soon as it enters the viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/about/');
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

for (const path of ['/work/', '/about/', '/e2e/about/']) {
  test(`the headings of ${path} nest without skipping a level`, async ({ page }) => {
    await page.goto(path);
    const levels = await page
      .locator('main')
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((headings) =>
        headings
          .filter((heading) => heading.checkVisibility())
          .map((heading) => Number(heading.tagName[1])),
      );
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((level, index) => {
      expect(level, `heading ${index + 2} of ${levels.join(', ')}`).toBeLessThanOrEqual(
        levels[index] + 1,
      );
    });
  });
}

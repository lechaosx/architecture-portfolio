import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ImageManifest } from '../../src/images';

/** Waits for the transitions under way on `locator`, such as its hover's, to end. */
function transitionsEnd(locator: Locator) {
  return locator.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
}

const recordsReveals = new WeakSet<Page>();

/**
 * Runs `navigate` until the page it reaches at `url` is revealed with a view
 * transition, going back to try again; fails after three without one. A busy
 * Chromium can skip a transition the page asks for.
 */
async function navigateWithTransition(
  page: Page,
  url: RegExp,
  navigate: () => Promise<unknown>,
) {
  if (!recordsReveals.has(page)) {
    recordsReveals.add(page);
    await page.addInitScript(() => {
      addEventListener('pagereveal', (event) => {
        sessionStorage.setItem(
          'revealed',
          JSON.stringify({
            href: location.href,
            transition: Boolean((event as PageRevealEvent).viewTransition),
          }),
        );
      });
    });
  }
  const revealed = () =>
    page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('revealed') ?? 'null') as {
          href: string;
          transition: boolean;
        } | null,
    );
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await page.goBack();
    await page.evaluate(() => sessionStorage.removeItem('revealed'));
    await navigate();
    await expect(page).toHaveURL(url);
    await expect.poll(async () => url.test((await revealed())?.href ?? '')).toBe(true);
    if ((await revealed())!.transition) return;
  }
  throw new Error(`Three navigations to ${url} went without a view transition`);
}

/**
 * A project card on the work page, the address of its project and the view
 * transition name its cover shares with that page's.
 */
async function projectCard(page: Page, nth = 0, morph = false) {
  const cards = page.locator(morph ? 'main .grid > a:has(.project-cover)' : 'main .grid > a');
  const card = cards.nth(nth);
  const path = new URL((await card.getAttribute('href'))!, page.url()).pathname;
  const cover = await card
    .locator('div').first()
    .evaluate((element) => getComputedStyle(element).viewTransitionName);
  return { card, url: new RegExp(`${path}$`), cover };
}

test('work cards do not start a second entrance animation after navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/about/');
  await page.getByRole('link', { name: 'Work' }).click();
  await expect(page).toHaveURL(/\/work\/?$/);

  const { card: project } = await projectCard(page);
  await expect(project).toBeVisible();
  const frames = await project.evaluate(async (element) => {
    const values = [];
    for (let frame = 0; frame < 4; frame += 1) {
      const style = getComputedStyle(element);
      values.push({ opacity: style.opacity, transform: style.transform });
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  expect(frames).toEqual(
    Array.from({ length: 4 }, () => ({ opacity: '1', transform: 'none' })),
  );
});

test('cover hover does not change the shared transition box', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/work/');
  const { card: project } = await projectCard(page);
  const transitionCover = project.locator('div').first();
  const image = project.locator('img');
  const before = await transitionCover.boundingBox();
  const imageBefore = (await image.boundingBox())!;

  await project.hover();
  await transitionsEnd(image);
  expect(await transitionCover.boundingBox()).toEqual(before);
  expect((await image.boundingBox())!.width).toBeGreaterThan(imageBefore.width);
});

test('project page cover hover does not change the shared transition box', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // tests/e2e/pages/[fixture].astro, which the e2e build adds.
  await page.goto('/e2e/project/');
  const transitionBox = () =>
    page.evaluate(() => {
      const named = Array.from(document.querySelectorAll('*')).find(
        (element) =>
          getComputedStyle(element).viewTransitionName === 'cover-e2e-project',
      )!;
      const { width, height } = named.getBoundingClientRect();
      return { width: Math.round(width), height: Math.round(height) };
    });
  const cover = page.getByRole('button', { name: 'Open image 1', exact: true });
  const image = cover.locator('img');
  const before = await transitionBox();
  const imageBefore = (await image.boundingBox())!;

  await cover.hover();
  await transitionsEnd(image);
  expect(await transitionBox()).toEqual(before);
  expect((await image.boundingBox())!.width).toBeGreaterThan(imageBefore.width);
});

test('opening a project starts a cross-document view transition', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName === 'firefox',
    'The pinned Firefox does not support cross-document View Transitions',
  );
  await page.goto('/work/');
  const { card, url } = await projectCard(page);
  // The page asks for a transition, which the browser may skip when busy.
  await navigateWithTransition(page, url, () => card.click());
});

test('non-square project cover uses the shared crop transition class', async ({
  page,
}) => {
  await page.goto('/e2e/project/');
  const cover = page.locator('.project-cover');
  await expect(cover).toBeVisible();
  expect(
    await cover.evaluate((image) => getComputedStyle(image).viewTransitionClass),
  ).toBe('project-cover');
  const box = (await cover.boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(1.2);
});

/** The elements of the page that hold a project's morph name, and their first image's index. */
function morphTargets(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('article *'))
      .filter((element) => getComputedStyle(element).viewTransitionName.startsWith('cover-'))
      .map((element) => ({
        name: getComputedStyle(element).viewTransitionName,
        index: element.closest('[data-lightbox-index]')?.getAttribute('data-lightbox-index'),
      })),
  );
}

for (const fixture of ['project', 'gallery-first', 'set-first']) {
  test(`the morph target is the first image of the ${fixture} fixture`, async ({ page }) => {
    await page.goto(`/e2e/${fixture}/`);
    expect(await morphTargets(page)).toEqual([{ name: `cover-e2e-${fixture}`, index: '0' }]);
  });
}

test('the morph target of a leading multi-image set is as large as its track', async ({
  page,
}) => {
  await page.goto('/e2e/set-first/');
  const [slideBox, trackBox] = await Promise.all([
    page.locator('.project-cover').boundingBox(),
    page.locator('[data-carousel-track]').boundingBox(),
  ]);
  expect(slideBox).toEqual(trackBox);
});

test('no element is a morph target when the first block is text', async ({ page }) => {
  await page.goto('/e2e/text-first/');
  expect(await morphTargets(page)).toEqual([]);
  expect(await page.locator('.project-cover').count()).toBe(0);
});

test('the first image of a page loads and decodes eagerly and the others lazily', async ({ page }) => {
  for (const path of ['/e2e/project/', '/e2e/text-first/']) {
    await page.goto(path);
    const loading = await page
      .locator('article button[data-lightbox-index] img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('loading')));
    expect(loading[0], path).not.toBe('lazy');
    expect(loading.slice(1).every((value) => value === 'lazy'), path).toBe(true);
    const decoding = await page
      .locator('article button[data-lightbox-index] img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('decoding')));
    expect(decoding[0], path).not.toBe('async');
    expect(decoding.slice(1).every((value) => value === 'async'), path).toBe(true);
  }
});

test('the work card shows the cover shared by its project', async ({ page }) => {
  await page.goto('/work/');
  const { card } = await projectCard(page);
  const cardSrc = await card.locator('img').getAttribute('src');
  await card.click();
  const { images } = await (await page.request.get('/_responsive/manifest.json')).json() as ImageManifest;
  const cover = images[cardSrc!] ?? Object.values(images).find(({ source }) => source.url === cardSrc);
  const shared = cover?.share;
  if (shared) {
    const preview = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(new URL(preview!).pathname).toBe(shared.url);
  } else {
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  }
});

// tests/e2e/pages/[fixture].astro, which the e2e build adds: a work page and
// a landing page listing the thumbnail fixtures.
for (const path of ['/e2e/thumbnail-work/', '/e2e/thumbnail-landing/']) {
  test(`project covers morph one uncropped snapshot in both directions from ${path}`, async ({
    browserName,
    page,
  }) => {
    test.skip(
      browserName === 'firefox',
      'The pinned Firefox does not support cross-document View Transitions',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(path);
    const { card: project, url, cover } = await projectCard(page, 0, true);
    await page.addInitScript((cover) => {
      addEventListener('pagereveal', (event) => {
        const transition = (event as PageRevealEvent).viewTransition;
        if (!transition) return;
        void transition.ready.then(() => {
          const pseudo = (part: string) => `::view-transition-${part}(${cover})`;
          // A hidden snapshot generates no pseudo-element, so it has no animation.
          const animated = (part: string) =>
            document
              .getAnimations()
              .filter(
                (animation) =>
                  (animation.effect as KeyframeEffect).pseudoElement ===
                  pseudo(part),
              );
          const opening = animated('new')[0];
          opening?.pause();
          if (opening) opening.currentTime = 0;
          const style = (part: string) =>
            getComputedStyle(document.documentElement, pseudo(part));
          sessionStorage.setItem(
            'cover-snapshots',
            JSON.stringify({
              // The group animates only between an old and a new snapshot.
              groupAnimated: animated('group').length > 0,
              oldAnimated: animated('old').length > 0,
              oldAnimation: style('old').animationName,
              newAnimated: animated('new').length > 0,
              newScale: Number(style('new').scale) || 1,
            }),
          );
          opening?.play();
        });
      });
    }, cover);
    const snapshots = () =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('cover-snapshots') ?? 'null'),
      );

    let hovered = 0;
    await navigateWithTransition(page, url, async () => {
      await project.hover();
      await transitionsEnd(project.locator('img'));
      hovered = await project
        .locator('.project-cover')
        .evaluate((cover) => cover.querySelector('img')!.getBoundingClientRect().width / cover.clientWidth);
      await project.click();
    });
    expect(hovered).toBeGreaterThan(1);
    await expect
      .poll(snapshots)
      .toMatchObject({ groupAnimated: true, oldAnimated: false, newAnimated: true });
    expect((await snapshots()).newScale).toBeCloseTo(hovered, 2);

    await page.evaluate(() => sessionStorage.removeItem('cover-snapshots'));
    // The project page links only to the shipped listings, so the page itself
    // navigates back to the fixture's.
    await navigateWithTransition(page, new RegExp(`${path}$`), () =>
      page.evaluate((path) => setTimeout(() => location.assign(path)), path),
    );
    // The retained project snapshot holds still while its box shrinks to the card.
    await expect
      .poll(snapshots)
      .toMatchObject({ groupAnimated: true, oldAnimation: 'none', newAnimated: false });
  });
}

test('a keyboard-opened project starts from its own card, not the hovered one', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName === 'firefox',
    'The pinned Firefox does not support cross-document View Transitions',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/e2e/thumbnail-work/');
  const opened = await projectCard(page, 0, true);
  // Another card with a morph, whose hover zoom the opening could pick up.
  const { card: hovered } = await projectCard(page, 1, true);
  await page.addInitScript((cover) => {
    addEventListener('pagereveal', (event) => {
      const transition = (event as PageRevealEvent).viewTransition;
      if (!transition) return;
      void transition.ready.then(() => {
        const pseudo = `::view-transition-new(${cover})`;
        const opening = document
          .getAnimations()
          .find(
            (animation) =>
              (animation.effect as KeyframeEffect).pseudoElement === pseudo,
          );
        if (!opening) return;
        opening.pause();
        opening.currentTime = 0;
        sessionStorage.setItem(
          'opening-scale',
          getComputedStyle(document.documentElement, pseudo).scale,
        );
        opening.play();
      });
    });
  }, opened.cover);

  await navigateWithTransition(page, opened.url, async () => {
    await hovered.hover();
    await transitionsEnd(hovered.locator('img'));
    await opened.card.focus();
    await page.keyboard.press('Enter');
  });
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('opening-scale')))
    .not.toBeNull();
  const scale = await page.evaluate(() => sessionStorage.getItem('opening-scale'));
  expect(Number(scale) || 1).toBeCloseTo(1, 2);
});

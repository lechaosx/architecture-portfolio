import { expect, test, type Locator, type Page } from '@playwright/test';

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

test('work cards do not start a second entrance animation after navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Work' }).click();
  await expect(page).toHaveURL(/\/work\/?$/);

  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
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
  await page.goto('/work');
  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
  const transitionCover = project.locator('.project-cover');
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
  await page.goto('/projects/urban-study-kyjov/');
  const transitionBox = () =>
    page.evaluate(() => {
      const named = Array.from(document.querySelectorAll('*')).find(
        (element) =>
          getComputedStyle(element).viewTransitionName ===
          'cover-urban-study-kyjov',
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
  await page.goto('/work');
  // The page asks for a transition, which the browser may skip when busy.
  await navigateWithTransition(page, /\/projects\/urban-study-kyjov\/$/, () =>
    page.locator('a[href="/projects/urban-study-kyjov/"]').click(),
  );
});

test('non-square project cover uses the shared crop transition class', async ({
  page,
}) => {
  await page.goto('/work');
  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
  await project.click();
  await expect(page).toHaveURL(/\/projects\/urban-study-kyjov\/$/);

  const cover = page.locator('.project-cover');
  await expect(cover).toBeVisible();
  expect(
    await cover.evaluate((image) => getComputedStyle(image).viewTransitionClass),
  ).toBe('project-cover');
  const box = (await cover.boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(1.2);
});

test('project covers morph one uncropped snapshot in both directions', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName === 'firefox',
    'The pinned Firefox does not support cross-document View Transitions',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    addEventListener('pagereveal', (event) => {
      const transition = (event as PageRevealEvent).viewTransition;
      if (!transition) return;
      void transition.ready.then(() => {
        const pseudo = (part: string) =>
          `::view-transition-${part}(cover-urban-study-kyjov)`;
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
            oldAnimated: animated('old').length > 0,
            oldAnimation: style('old').animationName,
            newAnimated: animated('new').length > 0,
            newScale: Number(style('new').scale) || 1,
          }),
        );
        opening?.play();
      });
    });
  });
  const snapshots = () =>
    page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('cover-snapshots') ?? 'null'),
    );

  await page.goto('/work');
  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
  await navigateWithTransition(page, /\/projects\/urban-study-kyjov\/$/, async () => {
    await project.hover();
    await transitionsEnd(project.locator('img'));
    await project.click();
  });
  await expect
    .poll(snapshots)
    .toMatchObject({ oldAnimated: false, newAnimated: true });
  expect((await snapshots()).newScale).toBeCloseTo(1.03, 2);

  await page.evaluate(() => sessionStorage.removeItem('cover-snapshots'));
  await navigateWithTransition(page, /\/work\/?$/, () =>
    page.getByRole('link', { name: 'Back to work' }).click(),
  );
  // The retained project snapshot holds still while its box shrinks to the card.
  await expect
    .poll(snapshots)
    .toMatchObject({ oldAnimation: 'none', newAnimated: false });
});

test('a keyboard-opened project starts from its own card, not the hovered one', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName === 'firefox',
    'The pinned Firefox does not support cross-document View Transitions',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    addEventListener('pagereveal', (event) => {
      const transition = (event as PageRevealEvent).viewTransition;
      if (!transition) return;
      void transition.ready.then(() => {
        const pseudo = '::view-transition-new(cover-urban-study-kyjov)';
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
  });

  await page.goto('/work');
  const hovered = page.locator('a[href="/projects/exotarium-brno-zoo/"]');
  await navigateWithTransition(page, /\/projects\/urban-study-kyjov\/$/, async () => {
    await hovered.hover();
    await transitionsEnd(hovered.locator('img'));
    await page.locator('a[href="/projects/urban-study-kyjov/"]').focus();
    await page.keyboard.press('Enter');
  });
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('opening-scale')))
    .not.toBeNull();
  const scale = await page.evaluate(() => sessionStorage.getItem('opening-scale'));
  expect(Number(scale) || 1).toBeCloseTo(1, 2);
});

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';

// tests/e2e/pages/[fixture].astro, which the e2e build adds.
const projectPath = '/e2e/project/';
// How many images its lightbox shows.
const total = 24;
const phone = { viewport: { width: 390, height: 844 } };
const touchPhone = { ...phone, hasTouch: true, isMobile: true };

function galleryImage(page: Page, position: number, label = 'Open image') {
  return page.getByRole('button', {
    name: `${label} ${position}`,
    exact: true,
  });
}

/**
 * Opens the project page, on `suffix` if given, with the page's clock faked
 * so a test can hold and step it.
 */
async function gotoProject(page: Page, suffix = '') {
  await installClock(page);
  await page.goto(`${projectPath}${suffix}`);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

async function waitForLightbox(page: Page, name = 'Image viewer') {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  // Once its drawing has loaded, the opening takes less than a second.
  await page.waitForFunction(() =>
    document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
      ?.complete,
  );
  if (clocked.has(page)) await page.clock.runFor(1000);
  else await page.waitForTimeout(1000);
}

// The page's clock runs every move in the lightbox; installed as a page
// loads, it can be held and stepped.
const clocked = new WeakSet<Page>();

async function installClock(page: Page) {
  if (clocked.has(page)) return;
  clocked.add(page);
  await page.clock.install();
}

/**
 * Holds the page's clock, so nothing moves until it is stepped or released.
 * It pauses a little ahead, so call it while nothing moves. A busy machine can
 * take longer than that between reading the page's time and pausing, which
 * Playwright rejects as a pause in the past; it then reads the time again.
 */
async function holdTime(page: Page) {
  for (;;) {
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
      return;
    } catch (error) {
      if (!String(error).includes('Cannot fast-forward to the past')) throw error;
    }
  }
}


/** Rendered width of the current lightbox image relative to its rest (100%) width. */
async function imageZoom(page: Page) {
  return page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>(
      '.lightbox-slide-current .lightbox-front > img',
    )!;
    return image.getBoundingClientRect().width / image.offsetWidth;
  });
}

/**
 * Waits for the current card's drawings to load. A blend, and a turn that
 * goes with it, waits for its drawing, which loads whatever the clock does.
 */
async function drawingsLoaded(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')].every(
      (image) => image.complete,
    ),
  );
}

/**
 * Makes `change` with time held, steps `time` ms into the move it starts,
 * and reports the turn (1 text side up, 0 drawing side up), each face's
 * blend and where the strip is. Time stays held until the clock is resumed.
 */
async function cardMoveAt(page: Page, time: number, change: () => Promise<unknown>) {
  await holdTime(page);
  await change();
  await drawingsLoaded(page);
  await page.clock.runFor(time);
  return page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.lightbox-slide-current [data-lightbox-sheet]')!;
    const blend = (face: string) =>
      Number(
        getComputedStyle(sheet.querySelector(`${face} .lightbox-incoming`) ?? sheet).opacity,
      );
    const m11 = new DOMMatrix(
      getComputedStyle(sheet.querySelector('.lightbox-front')!).transform,
    ).m11;
    return {
      hash: location.hash,
      turn: Math.acos(Math.max(-1, Math.min(1, m11))) / Math.PI,
      front: blend('.lightbox-front'),
      back: blend('.lightbox-back'),
      stripX: document
        .querySelector('.lightbox-slide-current')!
        .getBoundingClientRect().x,
    };
  });
}

/** Horizontal scale of the current card's turn: 1 drawing side up, −1 text side up. */
async function sheetTurn(page: Page) {
  return page
    .locator('.lightbox-slide-current .lightbox-front')
    .evaluate((front) => new DOMMatrix(getComputedStyle(front).transform).m11);
}

/** Sends one-finger touch events at height 420; no `x` lifts the finger. */
async function oneFinger(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: 420 }],
    });
}

/** The card's box and its text column's. */
function boxes(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element | null) => {
      const box = element!.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      card: rect(document.querySelector('.lightbox-card')),
      article: rect(document.querySelector('.lightbox-card article')),
    };
  });
}

/** Waits until nothing in the lightbox has moved for a few frames. */
async function settled(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const look = () =>
          [...document.querySelectorAll('[data-gallery-lightbox], [data-gallery-lightbox] [style]')]
            .map((element) => element.getAttribute('style'))
            .join('|') + document.getAnimations().length;
        let last = look();
        let still = 0;
        const frame = () => {
          const now = look();
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 5) resolve(true);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

/** The front drawing's computed transform, as scale and offset. */
function drawingView(page: Page) {
  return page.evaluate(() => {
    const image = document.querySelector('.lightbox-slide-current .lightbox-front > img')!;
    const matrix = new DOMMatrix(getComputedStyle(image).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
}

/**
 * Starts a turn (by default with the flip button) with time held; the
 * returned function steps time on until the turn reaches `turn`, going the
 * way it goes, and reports the card's and the front drawing's projected
 * boxes there.
 */
async function pausedFlip(
  page: Page,
  start = () => page.getByRole('button', { name: 'Show description' }).click(),
) {
  const turned = () =>
    page.evaluate(() =>
      Number(
        document
          .querySelector<HTMLElement>('.lightbox-slide-current [data-lightbox-sheet]')!
          .style.getPropertyValue('--lightbox-turn'),
      ),
    );
  await holdTime(page);
  const from = await turned();
  await start();
  const over = from < 0.5;
  return async (turn: number) => {
    while ((await turned()) < turn === over) await page.clock.runFor(4);
    return page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document
          .querySelector(`.lightbox-slide-current ${selector}`)!
          .getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return { card: box('.lightbox-card'), front: box('.lightbox-front > img') };
    });
  };
}

async function pixelAt(page: Page, x: number, y: number) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return [...(await sharp(png).raw().toBuffer()).subarray(0, 3)];
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('buttons and arrow keys navigate one addressable lightbox history entry', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 2).click();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-2$/);
  const current = page
    .getByRole('navigation', { name: 'Images in this set' })
    .locator('[aria-current="true"]');
  await expect(current).toHaveText('Tiled variant 2');

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#image-3$/);
  await expect(current).toHaveText('Tiled variant 3');
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#image-2$/);
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page).toHaveURL(/#image-3$/);

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));

  await page.goForward();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-3$/);
});

test('a directly linked image closes to its project before leaving the page', async ({
  page,
}) => {
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-3$/);

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('separate galleries share a lightbox across the full-width drawing', async ({
  page,
}) => {
  await page.goto(projectPath);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const duplicateTriggers = page.locator(
    'button[data-lightbox-index]:has(img[src="/e2e/images/cover.png"])',
  );
  await expect(duplicateTriggers).toHaveCount(2);
  const cover = duplicateTriggers.first();
  const lastGalleryDrawing = duplicateTriggers.last();
  // The fixture's second full-width set, after the cover and its galleries.
  const fullWidthDrawing = page.locator('button[data-lightbox-index="21"]');
  const [coverBox, galleryBox, fullWidthBox] = await Promise.all([
    cover.boundingBox(),
    lastGalleryDrawing.boundingBox(),
    fullWidthDrawing.boundingBox(),
  ]);

  expect(fullWidthBox!.width).toBeCloseTo(coverBox!.width, 0);
  expect(galleryBox!.width).toBeLessThan(fullWidthBox!.width / 2);

  const [coverIndex, repeatIndex] = await Promise.all([
    cover.getAttribute('data-lightbox-index'),
    duplicateTriggers.last().getAttribute('data-lightbox-index'),
  ]);
  expect(coverIndex).toBe('0');
  expect(repeatIndex).not.toBe(coverIndex);

  await fullWidthDrawing.click();
  await waitForLightbox(page);
  const fullWidthIndex = Number(
    await fullWidthDrawing.getAttribute('data-lightbox-index'),
  );
  await expect(page).toHaveURL(
    new RegExp(`#image-${fullWidthIndex + 1}$`),
  );
  await expect(
    page.getByRole('dialog', { name: 'Image viewer' }).getByRole('status'),
  ).toHaveText(`${fullWidthIndex + 1} / ${total}`);

  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    '/e2e/images/square-1.png',
  );
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);

  await cover.click();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-1$/);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);

  await duplicateTriggers.last().click();
  await waitForLightbox(page);
  await expect(page).toHaveURL(
    new RegExp(`#image-${Number(repeatIndex) + 1}$`),
  );
});

test('the original remains an explicit download while the lightbox uses processed imagery', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 2);
  const uploadedSource = await thumbnail.locator('img').getAttribute('src');
  await thumbnail.click();
  await waitForLightbox(page);

  const original = page.getByRole('link', { name: 'Open original' });
  await expect(original).toHaveAttribute('target', '_blank');
  expect(
    await original.evaluate((link: HTMLAnchorElement) =>
      decodeURIComponent(new URL(link.href).pathname),
    ),
  ).toBe(uploadedSource);

  const preview = page.locator('.lightbox-slide-current img');
  await expect(preview).toHaveAttribute('src', /\/_responsive\/.+\.webp$/);
  await expect
    .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('.openseadragon-canvas canvas')).toBeVisible();
});

test('pyramid previews form a loaded strip with no navigation gutter', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 2).click();
  await waitForLightbox(page);

  const slides = [
    page.locator('.lightbox-slide-previous'),
    page.locator('.lightbox-slide-current'),
    page.locator('.lightbox-slide-next'),
  ];
  for (const slide of slides) {
    await expect
      .poll(() =>
        slide.locator('img').evaluate((image: HTMLImageElement) => image.complete),
      )
      .toBe(true);
    await expect
      .poll(() =>
        slide
          .locator('img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  }

  const [previous, current, next] = await Promise.all(
    slides.map((slide) => slide.boundingBox()),
  );
  expect(previous!.x + previous!.width).toBeCloseTo(current!.x, 0);
  expect(current!.x + current!.width).toBeCloseTo(next!.x, 0);

  const stage = page.locator('.lightbox-stage');
  const stageBox = (await stage.boundingBox())!;
  await page.mouse.move(
    stageBox.x + stageBox.width / 2,
    stageBox.y + stageBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    stageBox.x + stageBox.width / 2 + 100,
    stageBox.y + stageBox.height / 2,
  );
  const draggedSlide = (await slides[1].boundingBox())!;
  expect(draggedSlide.x - current!.x).toBeCloseTo(100, 0);
  await page.mouse.move(
    stageBox.x + stageBox.width / 2 + 20,
    stageBox.y + stageBox.height / 2,
  );
  await page.mouse.up();
  await expect(page).toHaveURL(/#image-2$/);
});

test.describe(() => {
  test.use({ viewport: { width: 390, height: 667 }, deviceScaleFactor: 2 });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One browser verifies the shared DZI requests',
  );

  test('the pyramid requests the closest level that does not need upscaling', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const tileLevels: number[] = [];
    page.on('request', (request) => {
      const match = /\/image_files\/(\d+)\//.exec(request.url());
      if (match) tileLevels.push(Number(match[1]));
    });
    await gotoProject(page);
    await galleryImage(page, 2).click();
    await waitForLightbox(page);
    await expect.poll(() => tileLevels.length).toBeGreaterThan(0);

    const image = page.locator('.lightbox-slide-current img');
    const dimensions = await image.evaluate((element: HTMLImageElement) => ({
      sourceWidth: Number(element.getAttribute('width')),
      sourceHeight: Number(element.getAttribute('height')),
      renderedWidth: element.getBoundingClientRect().width,
      renderedHeight: element.getBoundingClientRect().height,
      pixelRatio: devicePixelRatio,
    }));
    const maxLevel = Math.ceil(
      Math.log2(Math.max(dimensions.sourceWidth, dimensions.sourceHeight)),
    );
    const selectedLevel = Math.max(...tileLevels);
    const divisor = 2 ** (maxLevel - selectedLevel);
    const levelWidth = Math.ceil(dimensions.sourceWidth / divisor);
    const levelHeight = Math.ceil(dimensions.sourceHeight / divisor);
    const lowerWidth = Math.ceil(dimensions.sourceWidth / (divisor * 2));
    const lowerHeight = Math.ceil(dimensions.sourceHeight / (divisor * 2));
    const requiredWidth = dimensions.renderedWidth * dimensions.pixelRatio;
    const requiredHeight = dimensions.renderedHeight * dimensions.pixelRatio;

    expect(levelWidth).toBeGreaterThanOrEqual(requiredWidth);
    expect(levelHeight).toBeGreaterThanOrEqual(requiredHeight);
    expect(lowerWidth < requiredWidth || lowerHeight < requiredHeight).toBe(true);
  });
});

test('mouse swipe, zoom, pan, and reset use the same direct manipulation model', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);
  const stage = page.locator('.lightbox-stage');
  const slide = page.locator('.lightbox-slide-current');
  const bounds = (await stage.boundingBox())!;
  const start = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  const beforeSwipe = (await slide.boundingBox())!;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 100, start.y);
  expect((await slide.boundingBox())!.x - beforeSwipe.x).toBeCloseTo(-100, 0);
  await page.mouse.up();
  await expect(page).toHaveURL(/#image-11$/);

  await stage.hover();
  await page.mouse.wheel(0, -800);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  const currentImage = page.locator('.lightbox-slide-current img');
  const transformBeforePan = await currentImage.evaluate(
    (image) => getComputedStyle(image).transform,
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40);
  await page.mouse.up();
  expect(
    await currentImage.evaluate((image) => getComputedStyle(image).transform),
  ).not.toBe(transformBeforePan);

  await page.mouse.dblclick(start.x, start.y);
  await expect(currentImage).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
});

test('desktop navigation overlays the full-screen stage and stays clickable while zoomed', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  const stage = page.locator('.lightbox-stage');
  const next = page.getByRole('button', { name: 'Next image' });
  const [stageBox, nextBox] = await Promise.all([
    stage.boundingBox(),
    next.boundingBox(),
  ]);
  expect(stageBox).toEqual({
    x: 0,
    y: 0,
    ...page.viewportSize()!,
  });
  expect(nextBox!.x + nextBox!.width).toBeGreaterThan(stageBox!.width - 20);

  await stage.hover();
  await page.mouse.wheel(0, -1200);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  expect(await next.boundingBox()).toEqual(nextBox);

  await next.click();
  await expect(page).toHaveURL(/#image-11$/);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
});

test('comparison shortcuts preserve the inspected area without changing page previews', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const failedSetImages: string[] = [];
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      response.url().includes('/e2e/images/untiled-')
    ) {
      failedSetImages.push(response.url());
    }
  });
  await page.goto(projectPath);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const previews = [18, 19, 20].map((position) => galleryImage(page, position));
  for (const preview of previews) await expect(preview).toBeVisible();

  await previews[0].click();
  await waitForLightbox(page);
  const comparison = page.getByRole('navigation', {
    name: 'Images in this set',
  });
  await expect(comparison.getByRole('button', { name: 'Untiled variant 18' })).toHaveAttribute(
    'aria-current',
    'true',
  );

  const stage = page.locator('.lightbox-stage');
  const bounds = (await stage.boundingBox())!;
  await stage.hover();
  await page.mouse.wheel(0, -800);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 30);
  await page.mouse.up();
  const zoom = await imageZoom(page);
  expect(zoom).toBeGreaterThan(1);
  const transform = await page
    .locator('.lightbox-front > img')
    .evaluate((image: HTMLImageElement) => getComputedStyle(image).transform);

  const blendState = await cardMoveAt(page, 90, () => comparison.getByRole('button', { name: 'Untiled variant 19' }).click());
  expect(blendState.front).toBeGreaterThan(0);
  expect(blendState.front).toBeLessThan(1);
  expect(blendState.stripX).toBe(0);
  expect(
    await page.locator('[aria-label="Images in this set"] button:disabled').count(),
  ).toBe(1);
  await page.clock.resume();
  await expect(page).toHaveURL(/#image-19$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  await expect
    .poll(() =>
      page
        .locator('.lightbox-front > img')
        .evaluate((image: HTMLImageElement) => getComputedStyle(image).transform),
    )
    .toBe(transform);
  expect(failedSetImages).toEqual([]);

  // The next image is the set's last variant: it blends and keeps the view.
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page).toHaveURL(/#image-20$/);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  // After the set comes a different card: it slides in at rest.
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page).toHaveURL(/#image-21$/);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
  await expect(
    page.getByRole('navigation', { name: 'Images in this set' }),
  ).toHaveCount(0);
});

test.describe(() => {
  test.use({ ...phone, deviceScaleFactor: 1 });

  test('the set strip scrolls beside the close control on a narrow screen', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(projectPath);
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
    await galleryImage(page, 19).click();
    await waitForLightbox(page);

    const comparison = page.getByRole('navigation', {
      name: 'Images in this set',
    });
    const [closeBox, comparisonBox, buttonBox] = await Promise.all([
      page.getByRole('button', { name: 'Close' }).boundingBox(),
      comparison.boundingBox(),
      comparison.getByRole('button', { name: 'Untiled variant 20' }).boundingBox(),
    ]);
    expect(buttonBox!.y).toBeCloseTo(closeBox!.y, 0);
    expect(buttonBox!.height).toBe(closeBox!.height);
    expect(comparisonBox!.x).toBeLessThan(20);
    expect(comparisonBox!.x + comparisonBox!.width).toBeLessThanOrEqual(
      closeBox!.x,
    );

    const visibility = await comparison.evaluate((navigation) => {
      const selected = navigation.querySelector<HTMLElement>(
        '[aria-current="true"]',
      )!;
      const navigationBox = navigation.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      return {
        overflows: navigation.scrollWidth > navigation.clientWidth,
        selectedLeft: selectedBox.left - navigationBox.left,
        selectedRight: navigationBox.right - selectedBox.right,
      };
    });
    expect(visibility.overflows).toBe(true);
    expect(visibility.selectedLeft).toBeGreaterThanOrEqual(0);
    expect(visibility.selectedRight).toBeGreaterThanOrEqual(0);

    await comparison.evaluate((navigation) => (navigation.scrollLeft = 0));
    const pageScroll = await page.evaluate(() => scrollY);
    await comparison.hover();
    await page.mouse.wheel(0, 120);
    await expect
      .poll(() => comparison.evaluate((navigation) => navigation.scrollLeft))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  });
});

test.describe(() => {
  test.use(phone);

  test('the set strip centres the current image again when the language changes its labels', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoProject(page);
    await galleryImage(page, 3).click();
    await waitForLightbox(page);
    const dialog = page.getByRole('dialog');
    // Named in the current language, so found by its role alone.
    const strip = dialog.getByRole('navigation');
    /** How far the current button's centre lies from the strip's centre. */
    const offCentre = () =>
      strip.evaluate((navigation) => {
        const selected = navigation
          .querySelector('[aria-current="true"]')!
          .getBoundingClientRect();
        const box = navigation.getBoundingClientRect();
        return Math.abs(
          selected.left + selected.width / 2 - (box.left + box.width / 2),
        );
      });
    await expect.poll(offCentre).toBeLessThanOrEqual(1.5);

    await dialog.locator('[data-lang-toggle]').click();
    await expect(strip).toHaveAccessibleName('Obrázky v sadě');
    await expect.poll(offCentre).toBeLessThanOrEqual(1.5);
  });
});

test.describe(() => {
  test.use({ ...touchPhone, deviceScaleFactor: 2 });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers shared input handling',
  );

  test('mobile touch stays inside the modal and navigation overlays the image edges', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoProject(page);
    const thumbnail = galleryImage(page, 10);
    await thumbnail.scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    await thumbnail.click();
    await waitForLightbox(page);

    const stage = page.locator('.lightbox-stage');
    const stageBox = (await stage.boundingBox())!;
    const previousBox = (await page
      .getByRole('button', { name: 'Previous image' })
      .boundingBox())!;
    expect(stageBox).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    expect(previousBox.x).toBeLessThan(20);
    expect(previousBox.y + previousBox.height / 2).toBeCloseTo(844 / 2, 0);
    await expect(stage).toHaveCSS('overflow', 'hidden');

    const session = await context.newCDPSession(page);
    const center = {
      x: stageBox.x + stageBox.width / 2,
      y: stageBox.y + stageBox.height / 2,
    };
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: center.x + 75, y: center.y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x - 75, y: center.y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(page).toHaveURL(/#image-11$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: center.x - 55, y: center.y },
        { x: center.x + 55, y: center.y },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: center.x - 105, y: center.y },
        { x: center.x + 105, y: center.y },
      ],
    });
    await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  });
});

test('the description is on the back of the drawing', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  const flip = dialog.getByRole('button', { name: 'Show description' });
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  await flip.click();

  const text = dialog.getByRole('region', { name: 'Tiled variant 3' });
  await expect(text).toBeVisible();
  await expect(
    text.getByRole('heading', { name: 'Tiled variant 3' }),
  ).toBeVisible();
  const paragraph = text.locator('p');
  await expect(paragraph).toHaveCSS('text-align', 'justify');
  expect((await paragraph.boundingBox())!.width).toBeLessThanOrEqual(672);
  const [textBox, closeBox, nextBox] = await Promise.all([
    text.locator('article').boundingBox(),
    dialog.getByRole('button', { name: 'Close' }).boundingBox(),
    dialog.getByRole('button', { name: 'Next image' }).boundingBox(),
  ]);
  expect(textBox!.y).toBeGreaterThanOrEqual(closeBox!.y + closeBox!.height);
  expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(nextBox!.x);

  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  await flip.click();
  await expect(text).toBeHidden();
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
});

test('changing image always shows the drawing; the language switch keeps the side', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Show description' }).click();
  await dialog.getByRole('button', { name: 'Switch to Czech' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(
    dialog.getByRole('region', { name: 'Dlaždicová varianta 3' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Zobrazit popis' }),
  ).toHaveAttribute('aria-pressed', 'true');

  await dialog.getByRole('button', { name: 'Další obrázek' }).click();
  await expect(page).toHaveURL(/#image-4$/);
  await expect(
    dialog.getByRole('button', { name: 'Zobrazit popis' }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('images without a description have no flip control', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 11).click();
  await waitForLightbox(page);
  await expect(
    page.getByRole('button', { name: 'Show description' }),
  ).toHaveCount(0);
});

test('long text scrolls inside the back and the wheel never zooms the hidden drawing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  const text = page.getByRole('region', { name: 'Tiled variant 3' });
  await text.hover();
  await page.mouse.wheel(0, 150);
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Show description' }).click();
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('on a phone the text uses the width and a sideways drag turns it back to the drawing', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page);
    await galleryImage(page, 6).click(); // the set's last member; next is another card
    await waitForLightbox(page);
    const flip = page.getByRole('button', { name: 'Show description' });
    await flip.click();
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
    await settled(page);
    const next = page.getByRole('button', { name: 'Next image', includeHidden: true });
    await expect(next).toBeHidden();
    const text = page.getByRole('region', { name: 'Tiled variant 6' });
    const paragraph = (await text.locator('p').boundingBox())!;
    expect(Math.round(paragraph.width)).toBe(390 - 48);

    const slide = page.locator('.lightbox-slide-current');
    const touch = await oneFinger(context, page);
    // On the 390 px stage the turn follows |dx| / 390: dx −100 has turned
    // 100 / 390 of the way back.
    await touch('touchStart', 300);
    await touch('touchMove', 200);
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(Math.cos(Math.PI * (1 - 100 / 390)), 2);
    expect((await slide.boundingBox())!.x).toBe(0);
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
    // The arrows come back with the turn, part of the way.
    await expect(next).toBeVisible();
    const partway = (await next.boundingBox())!;
    expect(partway.x).toBeGreaterThan(390 - partway.width);
    expect(partway.x).toBeLessThan(390);
    await touch('touchMove', 90);
    await touch('touchEnd');

    await expect.poll(() => sheetTurn(page)).toBeCloseTo(1, 3);
    await expect(page).toHaveURL(/#image-6$/);
    await expect(flip).toHaveAttribute('aria-pressed', 'false');
    await expect(text).toBeHidden();
    await expect(next).toBeVisible();
  });

  test('the description toggle takes a tap right after a quick swipe on either side', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page);
    await galleryImage(page, 6).click(); // the next image is another card, with a description
    await waitForLightbox(page);
    const touch = await oneFinger(context, page);
    // One long move is as quick as a swipe gets: the browser sees a fling.
    await touch('touchStart', 300);
    await touch('touchMove', 150);
    await touch('touchEnd');
    await expect(page).toHaveURL(/#image-7$/);

    const flip = page.getByRole('button', { name: 'Show description' });
    const box = (await flip.boundingBox())!;
    const tap = () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await tap();
    await expect(flip).toHaveAttribute('aria-pressed', 'true');
    await settled(page);

    // On the text the swipe turns the card back, and the tap turns it over again.
    await touch('touchStart', 300);
    await touch('touchMove', 150);
    await touch('touchEnd');
    await expect(flip).toHaveAttribute('aria-pressed', 'false');
    await tap();
    await expect(flip).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe(() => {
  test.use(phone);

  test('on a phone the edge arrows step aside with the turn and come back with it', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    const flip = page.getByRole('button', { name: 'Show description' });
    const arrows = ['Previous image', 'Next image'].map((name) =>
      page.getByRole('button', { name, includeHidden: true }),
    );
    const rest = await Promise.all(arrows.map(async (arrow) => (await arrow.boundingBox())!));
    /** Clicks the toggle and holds the turn halfway, where the arrows are halfway aside. */
    const halfway = async () => {
      await holdTime(page);
      await flip.click();
      await page.clock.runFor(280);
      const [previous, next] = await Promise.all(
        arrows.map(async (arrow) => (await arrow.boundingBox())!),
      );
      for (const arrow of arrows) await expect(arrow).toBeVisible();
      expect(previous.x).toBeLessThan(rest[0].x - 4);
      expect(previous.x + previous.width).toBeGreaterThan(0);
      expect(next.x).toBeGreaterThan(rest[1].x + 4);
      expect(next.x).toBeLessThan(390);
      await page.clock.resume();
      await settled(page);
    };

    await halfway();
    for (const arrow of arrows) await expect(arrow).toBeHidden();
    await halfway();
    for (const [at, arrow] of arrows.entries()) {
      await expect(arrow).toBeVisible();
      expect((await arrow.boundingBox())!.x).toBeCloseTo(rest[at].x, 0);
    }
  });

  test('on a phone the edge arrows ease back in as a slide from the text brings the next drawing', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-6'); // the next image is another card
    await waitForLightbox(page);
    const next = page.getByRole('button', { name: 'Next image', includeHidden: true });
    const rest = (await next.boundingBox())!;
    await page.getByRole('button', { name: 'Show description' }).click();
    await settled(page);
    await expect(next).toBeHidden();

    const partway = await recording(page, () =>
      page.evaluate((restX) => {
        const arrow = document.querySelector('[aria-label="Next image"]')!;
        const { x } = arrow.getBoundingClientRect();
        return (
          arrow.checkVisibility({ visibilityProperty: true }) &&
          x > restX + 4 &&
          x < innerWidth - 4
        );
      }, rest.x),
    );
    await page.keyboard.press('ArrowRight');
    await partway.step(20);
    await page.clock.resume();
    expect(partway.frames).toContain(true);
    await expect(page).toHaveURL(/#image-7$/);
    await settled(page);
    await expect(next).toBeVisible();
    expect((await next.boundingBox())!.x).toBeCloseTo(rest.x, 0);
  });
});

async function phoneOnText(context: BrowserContext, page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  const session = await context.newCDPSession(page);
  /**
   * Drags one finger through `points`, returning after each move the card's
   * turn (−1 text side up), the strip's offset and the blend towards another
   * image.
   */
  const drag = async (points: { x: number; y: number }[]) => {
    const moves: { turn: number; strip: number; blend: number }[] = [];
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [points[0]],
    });
    for (const point of points.slice(1)) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point],
      });
      moves.push(
        await page.evaluate(async () => {
          await new Promise(requestAnimationFrame);
          const blend = document.querySelector('.lightbox-incoming');
          return {
            turn: Math.round(
              new DOMMatrix(
                getComputedStyle(document.querySelector('.lightbox-front')!).transform,
              ).m11 * 1000,
            ) / 1000,
            strip: document
              .querySelector('.lightbox-slide-current')!
              .getBoundingClientRect().x,
            blend: blend ? Number(getComputedStyle(blend).opacity) : 0,
          };
        }),
      );
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    return moves;
  };
  return { drag };
}

const untouched = { turn: -1, strip: 0, blend: 0 };

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('scrolling the text on a phone leaves the card as it is', async ({
    page,
    context,
  }) => {
    const { drag } = await phoneOnText(context, page);
    const text = page.getByRole('region', { name: 'Tiled variant 3' });
    const scrollTop = () => text.evaluate((element) => element.scrollTop);

    // Mostly vertical: dx −60, dy −300.
    const diagonal = await drag(
      Array.from({ length: 16 }, (_, step) => ({ x: 300 - step * 4, y: 700 - step * 20 })),
    );
    await expect.poll(scrollTop).toBeGreaterThan(0);
    expect(diagonal).toEqual(diagonal.map(() => untouched));
    await page.waitForTimeout(500);
    const afterDiagonal = await scrollTop();

    // A scroll that turns sideways afterwards is still a scroll.
    const turning = [
      ...Array.from({ length: 16 }, (_, step) => ({ x: 360, y: 300 + step * 20 })),
      ...Array.from({ length: 9 }, (_, step) => ({ x: 320 - step * 40, y: 600 })),
    ];
    const moves = await drag(turning);
    await expect.poll(scrollTop).toBeLessThan(afterDiagonal);
    expect(moves).toEqual(moves.map(() => untouched));
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/#image-3$/);
    expect(await sheetTurn(page)).toBeCloseTo(-1, 3);
  });

  test('a text selection keeps a sideways drag from turning the card', async ({
    page,
    context,
  }) => {
    const { drag } = await phoneOnText(context, page);
    await page
      .getByRole('region', { name: 'Tiled variant 3' })
      .locator('p')
      .evaluate((paragraph) => getSelection()!.selectAllChildren(paragraph));
    const moves = await drag([
      { x: 300, y: 420 },
      { x: 200, y: 422 },
      { x: 90, y: 430 },
    ]);

    expect(moves).toEqual(moves.map(() => untouched));
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/#image-3$/);
    expect(await sheetTurn(page)).toBeCloseTo(-1, 3);
  });
});

test('Tab reaches the scrollable description', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  const text = page.getByRole('region', { name: 'Tiled variant 3' });
  for (
    let step = 0;
    step < 12 && !(await text.evaluate((element) => element === document.activeElement));
    step += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(text).toBeFocused();
});

test('reduced motion swaps the faces without rotating', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  const transforms = await page.evaluate(() =>
    ['.lightbox-front', '.lightbox-card'].map(
      (selector) => getComputedStyle(document.querySelector(selector)!).transform,
    ),
  );
  for (const transform of transforms) {
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  }
});

test('without reduced motion the card turns over both ways', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  const turning = async () => Math.abs(await sheetTurn(page)) < 0.99;
  const text = page.getByRole('region', { name: 'Tiled variant 3' });

  await holdTime(page);
  await flip.click();
  await page.clock.runFor(200);
  expect(await turning()).toBe(true);
  expect(
    await text.evaluate((element) =>
      Boolean(element.closest('[data-lightbox-sheet]')),
    ),
  ).toBe(true);
  await page.clock.runFor(1000);
  expect(await sheetTurn(page)).toBeCloseTo(-1, 3);
  await expect(text).toBeVisible();

  await flip.click();
  await page.clock.runFor(200);
  expect(await turning()).toBe(true);
  await page.clock.runFor(1000);
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  await expect(text).toBeHidden();
});

test('Next from the description slides the card away without turning it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 6).click(); // the set's last member; next is another card
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);

  await holdTime(page);
  await page.getByRole('button', { name: 'Next image' }).click();
  await page.clock.runFor(90);
  const state = await page.evaluate(() => {
    // The card it leaves, and the one arriving.
    const [leaving, arriving] = [':not(.lightbox-slide-current)', '.lightbox-slide-current'].map(
      (kind) => document.querySelector(`.lightbox-slide${kind}:has([data-lightbox-sheet])`)!,
    );
    const text = leaving.querySelector('[role="region"]');
    const turn = (slide: Element) =>
      new DOMMatrix(getComputedStyle(slide.querySelector('.lightbox-front')!).transform).m11;
    return {
      hash: location.hash,
      leavingX: leaving.getBoundingClientRect().x,
      text: text?.getAttribute('aria-label'),
      textVisible: Boolean(text?.checkVisibility({ visibilityProperty: true })),
      leavingTurn: turn(leaving),
      arrivingTurn: turn(arriving),
    };
  });
  expect(state.hash).toBe('#image-7');
  expect(state.leavingX).toBeLessThan(0);
  expect(state.text).toBe('Tiled variant 6');
  expect(state.textVisible).toBe(true);
  expect(state.leavingTurn).toBeCloseTo(-1, 3);
  expect(state.arrivingTurn).toBeCloseTo(1, 3);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');

  await page.clock.resume();
  await settled(page);
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  await expect(page.locator('[data-lightbox-sheet]')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Drawing 7' })).toBeHidden();
});

test('Next from the description to a variant turns back while blending both faces', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -600);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  const zoom = await imageZoom(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);

  const state = await cardMoveAt(page, 200, () => page.getByRole('button', { name: 'Next image' }).click());
  expect(state.hash).toBe('#image-4');
  expect(state.stripX).toBe(0);
  expect(state.turn).toBeGreaterThan(0.2);
  expect(state.turn).toBeLessThan(0.8);
  expect(state.front).toBeCloseTo(1 - state.turn, 1);
  expect(state.back).toBeCloseTo(1 - state.turn, 1);
  await page.clock.resume();

  await expect(page).toHaveURL(/#image-4$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  await flip.click();
  await expect(page.getByRole('region', { name: 'Tiled variant 4' })).toBeVisible();
});

test('a set button from the description turns back while blending both faces', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -600);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  const zoom = await imageZoom(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);

  const state = await cardMoveAt(page, 200, () => page
    .getByRole('navigation', { name: 'Images in this set' })
    .getByRole('button', { name: 'Tiled variant 5' })
    .click());
  expect(state.hash).toBe('#image-5');
  expect(state.stripX).toBe(0);
  expect(state.turn).toBeGreaterThan(0.2);
  expect(state.turn).toBeLessThan(0.8);
  expect(state.front).toBeCloseTo(1 - state.turn, 1);
  expect(state.back).toBeCloseTo(1 - state.turn, 1);
  await page.clock.resume();

  await expect(page).toHaveURL(/#image-5$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  await flip.click();
  await expect(page.getByRole('region', { name: 'Tiled variant 5' })).toBeVisible();
});

test('Next inside a set blends and keeps the view; leaving the set slides', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -600);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  const zoom = await imageZoom(page);
  const transform = await page
    .locator('.lightbox-front > img')
    .evaluate((image: HTMLImageElement) => getComputedStyle(image).transform);

  const state = await cardMoveAt(page, 90, () => page.getByRole('button', { name: 'Next image' }).click());
  expect(state.front).toBeGreaterThan(0);
  expect(state.front).toBeLessThan(1);
  expect(state.stripX).toBe(0);
  expect(state.turn).toBeCloseTo(0, 3);
  await page.clock.resume();
  await expect(page).toHaveURL(/#image-4$/);
  await settled(page);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  expect(
    await page
      .locator('.lightbox-front > img')
      .evaluate((image: HTMLImageElement) => getComputedStyle(image).transform),
  ).toBe(transform);

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#image-5$/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#image-6$/);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);

  // The next image slides in from the side.
  await holdTime(page);
  await page.getByRole('button', { name: 'Next image' }).click();
  await page.clock.runFor(90);
  expect(
    await page.evaluate(() => document.querySelector('.lightbox-slide-current')!.getBoundingClientRect().x),
  ).toBeGreaterThan(0);
  await page.clock.resume();
  await expect(page).toHaveURL(/#image-7$/);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
});

/**
 * What the controls say: the position, the set strip's current image and
 * whether the description toggle is there.
 */
function controlsNow(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-gallery-lightbox]')!;
    return {
      position: dialog
        .querySelector('a[target="_blank"]')!
        .textContent!.replace(/\s+/g, ' ')
        .trim(),
      current: dialog.querySelector('[aria-current="true"]')?.textContent?.trim(),
      toggle: Boolean(dialog.querySelector('[aria-pressed]')),
    };
  });
}

for (const [route, start, change, expected] of [
  [
    'Next to another card',
    6,
    (page: Page) => page.getByRole('button', { name: 'Next image' }).click(),
    { position: `7 / ${total}`, current: 'Drawing 7', toggle: true },
  ],
  [
    'the arrow key to a variant',
    3,
    (page: Page) => page.keyboard.press('ArrowRight'),
    { position: `4 / ${total}`, current: 'Tiled variant 4', toggle: true },
  ],
  [
    'a set button',
    3,
    (page: Page) => page.getByRole('button', { name: 'Tiled variant 5' }).click(),
    { position: `5 / ${total}`, current: 'Tiled variant 5', toggle: true },
  ],
  [
    'a released swipe',
    9,
    async (page: Page) => {
      await page.mouse.move(900, 400);
      await page.mouse.down();
      await page.mouse.move(700, 400);
      await page.mouse.up();
    },
    { position: `10 / ${total}`, current: 'Drawing 10', toggle: false },
  ],
] as const) {
  test(`the controls follow ${route} as soon as it is made`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, `#image-${start}`);
    await waitForLightbox(page);
    await change(page);
    expect(await controlsNow(page)).toEqual(expected);
  });
}

test('a drag that has not changed image leaves the controls as they were', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  const position = page.getByRole('link', { name: /^Open original/ });
  const current = page.locator('[aria-current="true"]');

  // A scrub towards the next variant, released short.
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await page.mouse.move(700, 400);
  await expect(page.locator('.lightbox-front .lightbox-incoming')).toHaveCount(1);
  await expect(position).toHaveText(new RegExp(`^\\s*3 / ${total}`));
  await expect(current).toHaveText('Tiled variant 3');
  await page.mouse.move(880, 400);
  await page.mouse.up();
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(position).toHaveText(new RegExp(`^\\s*3 / ${total}`));
  await expect(current).toHaveText('Tiled variant 3');

  // The strip moved towards another card.
  await page.goto(`${projectPath}#image-9`);
  await waitForLightbox(page);
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await page.mouse.move(700, 400);
  await expect
    .poll(async () => (await page.locator('.lightbox-slide-current').boundingBox())!.x)
    .toBeCloseTo(-200, 0);
  await expect(position).toHaveText(new RegExp(`^\\s*9 / ${total}`));
  await expect(current).toHaveText('Drawing 9');
  await page.mouse.up();
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('a drag towards a variant scrubs the blend instead of moving the strip', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page);
    await galleryImage(page, 3).click();
    await waitForLightbox(page);
    const touch = await oneFinger(context, page);
    const blend = () =>
      page.evaluate(() => {
        const layer = document.querySelector('.lightbox-incoming');
        return layer ? Number(getComputedStyle(layer).opacity) : 0;
      });
    const stripX = async () =>
      (await page.locator('.lightbox-slide-current').boundingBox())!.x;

    // On the 390 px stage the blend follows |dx| / 390, as a slide would move.
    await touch('touchStart', 300);
    await touch('touchMove', 144);
    await expect.poll(blend).toBeCloseTo(0.4, 2);
    expect(await stripX()).toBe(0);
    await touch('touchMove', 222);
    await expect.poll(blend).toBeCloseTo(0.2, 2);
    await touch('touchMove', 270);
    await expect.poll(blend).toBeCloseTo(30 / 390, 2);
    await touch('touchEnd');
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
    await expect(page).toHaveURL(/#image-3$/);

    await touch('touchStart', 300);
    await touch('touchMove', 183);
    await expect.poll(blend).toBeCloseTo(0.3, 2);
    expect(await stripX()).toBe(0);
    await touch('touchEnd');
    await expect(page).toHaveURL(/#image-4$/);
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);

    // At the set's first member the previous image is a different card.
    await page.getByRole('button', { name: 'Previous image' }).click();
    await expect(page).toHaveURL(/#image-3$/);
    await page.getByRole('button', { name: 'Previous image' }).click();
    await expect(page).toHaveURL(/#image-2$/);
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
    await touch('touchStart', 100);
    await touch('touchMove', 200);
    await expect.poll(stripX).toBeCloseTo(100, 0);
    expect(await blend()).toBe(0);
    await touch('touchEnd');
  });
});

test('a mouse drag towards a variant scrubs the blend too', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const blend = () =>
    page.evaluate(() => {
      const layer = document.querySelector('.lightbox-incoming');
      return layer ? Number(getComputedStyle(layer).opacity) : 0;
    });
  const width = page.viewportSize()!.width;
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(700 - width / 4, 400);
  expect(await blend()).toBeCloseTo(0.25, 2);
  expect((await page.locator('.lightbox-slide-current').boundingBox())!.x).toBe(0);
  await page.mouse.up();
  await expect(page).toHaveURL(/#image-4$/);
});

/** A phone showing image 3's text side, and one finger on it. */
async function phoneReading(
  context: BrowserContext,
  page: Page,
  reducedMotion: 'reduce' | 'no-preference',
) {
  await page.emulateMedia({ reducedMotion });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect(page.getByRole('region', { name: 'Tiled variant 3' })).toBeVisible();
  await settled(page);
  return { flip, touch: await oneFinger(context, page) };
}

/**
 * The way the text side is turning while it still faces the viewer: the edge
 * swinging towards the viewer is drawn larger and further out, so the card's
 * box leans to that edge, which the turn carries across to the other side.
 */
function backTurningTowards(page: Page) {
  return page.locator('.lightbox-card').first().evaluate((card) => {
    const box = card.getBoundingClientRect();
    const lean = box.x + box.width / 2 - innerWidth / 2;
    return Math.abs(lean) < 1 ? 'nowhere' : lean > 0 ? 'left' : 'right';
  });
}

/**
 * Which way the face towards the viewer leans (see `backTurningTowards`): the
 * front drawing while it faces the viewer, else the back's card.
 */
function faceLean(page: Page) {
  return page.evaluate(() => {
    const front = document.querySelector('.lightbox-front')!;
    const facing = new DOMMatrix(getComputedStyle(front).transform).m11 >= 0;
    const box = document
      .querySelector(facing ? '.lightbox-front > img' : '.lightbox-card')!
      .getBoundingClientRect();
    const lean = box.x + box.width / 2 - innerWidth / 2;
    return Math.abs(lean) < 1 ? 'nowhere' : lean > 0 ? 'right' : 'left';
  });
}

test('a change made while the card turns over carries on the turn without jumping to its mirror image', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-4');
  await waitForLightbox(page);
  await holdTime(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  // Well short of edge-on, where the card's lean shows clearly.
  await page.clock.runFor(150);
  const lean = await faceLean(page);
  expect(lean).not.toBe('nowhere');

  // Every frame of the turn back leans the same way, until the card lies flat.
  await page.keyboard.press('ArrowLeft');
  await drawingsLoaded(page);
  const leans = new Set<string>();
  for (let time = 0; time < 900; time += 16) {
    await page.clock.runFor(16);
    const now = await faceLean(page);
    if (now !== 'nowhere') leans.add(now);
  }
  await page.clock.resume();
  expect(leans).toEqual(new Set([lean]));
  await expect(page).toHaveURL(/#image-3$/);
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('the toggle tapped while a swipe turns the card back reverses the turn without jumping', async ({
    page,
    context,
  }) => {
    const { flip, touch } = await phoneReading(context, page, 'no-preference');
    await touch('touchStart', 100);
    await touch('touchMove', 220);
    await holdTime(page);
    await touch('touchEnd');
    await page.clock.runFor(32);
    const lean = await faceLean(page);
    expect(lean).not.toBe('nowhere');

    const box = (await flip.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(flip).toHaveAttribute('aria-pressed', 'true');
    await page.clock.runFor(32);
    expect(await faceLean(page)).toBe(lean);
    await page.clock.resume();
  });

  test('a drag on the text that takes over a turn keeps the way it was turning', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    const touch = await oneFinger(context, page);
    await holdTime(page);
    await page.getByRole('button', { name: 'Show description' }).click();
    await page.clock.runFor(250);

    // Rightwards, over a turn still under way, and short of turning it text up.
    await touch('touchStart', 100);
    await page.clock.runFor(32);
    const lean = await faceLean(page);
    expect(lean).not.toBe('nowhere');
    const leans = [];
    for (const x of [110, 120, 130]) {
      await touch('touchMove', x);
      await page.clock.runFor(32);
      leans.push(await faceLean(page));
    }
    await touch('touchEnd');
    await page.clock.resume();
    expect(leans).toEqual([lean, lean, lean]);
  });

  test('a drag on the text towards a variant only turns the card, and released short turns it back', async ({
    page,
    context,
  }) => {
    const { flip, touch } = await phoneReading(context, page, 'no-preference');
    const next = page.getByRole('button', { name: 'Next image', includeHidden: true });

    // On the 390 px stage: dx −117 turns 0.3 of the way back (126°), and half
    // the width (dx −195) is edge-on.
    await touch('touchStart', 300);
    await touch('touchMove', 183);
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(Math.cos(Math.PI * 0.7), 2);
    await touch('touchMove', 105);
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(0, 2);
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
    expect((await page.locator('.lightbox-slide-current').boundingBox())!.x).toBe(0);
    await touch('touchMove', 270);
    await expect
      .poll(() => sheetTurn(page))
      .toBeCloseTo(Math.cos(Math.PI * (1 - 30 / 390)), 2);
    await touch('touchEnd');

    await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
    await expect(page).toHaveURL(/#image-3$/);
    await expect(flip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Tiled variant 3' })).toBeVisible();
    await expect(next).toBeHidden();
  });

  test('a drag on the text past the threshold turns back to the drawing view the visitor left', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await expect
      .poll(async () => (await drawingView(page)).scale)
      .toBeCloseTo(1.5625, 3);
    await settled(page);
    const zoomedTransform = await page
      .locator('.lightbox-front > img')
      .evaluate((image) => getComputedStyle(image).transform);
    const flip = page.getByRole('button', { name: 'Show description' });
    await flip.click();
    await settled(page);
    const touch = await oneFinger(context, page);

    await touch('touchStart', 300);
    await touch('touchMove', 183);
    await touch('touchEnd');
    await expect(flip).toHaveAttribute('aria-pressed', 'false');
    await settled(page);
    await expect(page).toHaveURL(/#image-3$/);
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
    expect(await sheetTurn(page)).toBeCloseTo(1, 3);
    expect(
      await page
        .locator('.lightbox-front > img')
        .evaluate((image) => getComputedStyle(image).transform),
    ).toBe(zoomedTransform);
  });

  test('with reduced motion a drag on the text turns nothing until released past the threshold', async ({
    page,
    context,
  }) => {
    const { flip, touch } = await phoneReading(context, page, 'reduce');
    const turn = () =>
      page
        .locator('[data-lightbox-sheet]')
        .evaluate((sheet) => Number(getComputedStyle(sheet).getPropertyValue('--lightbox-turn')));

    await touch('touchStart', 300);
    await touch('touchMove', 200);
    await page.waitForTimeout(100);
    expect(await turn()).toBe(1);
    await holdTime(page);
    await touch('touchEnd');
    // The reduced turn: the faces crossfade.
    await page.clock.runFor(64);
    const back = await page
      .locator('.lightbox-back')
      .evaluate((face) => Number(getComputedStyle(face).opacity));
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(1);
    expect(await sheetTurn(page)).toBe(1);
    await page.clock.resume();
    await expect(flip).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('region', { name: 'Tiled variant 3' })).toBeHidden();
    await expect(page).toHaveURL(/#image-3$/);
  });

  test('a drag on the text turns the card the way the finger moves', async ({
    page,
    context,
  }) => {
    const { touch } = await phoneReading(context, page, 'no-preference');

    await touch('touchStart', 300);
    await touch('touchMove', 183);
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(Math.cos(Math.PI * 0.7), 2);
    expect(await backTurningTowards(page)).toBe('left');
    await touch('touchMove', 417);
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(Math.cos(Math.PI * 0.7), 2);
    expect(await backTurningTowards(page)).toBe('right');
    // Released, the turn carries on the same way.
    await holdTime(page);
    await touch('touchEnd');
    await page.clock.runFor(16);
    expect(await sheetTurn(page)).toBeLessThan(Math.cos(Math.PI * 0.6));
    expect(await backTurningTowards(page)).toBe('right');
    await page.clock.resume();
  });
});

for (const [key, towards] of [
  ['ArrowRight', 'left'],
  ['ArrowLeft', 'right'],
] as const) {
  test(`${key} from the text turns the card back towards the ${towards} as it blends`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-4');
    await waitForLightbox(page);
    await page.getByRole('button', { name: 'Show description' }).click();
    await settled(page);

    const state = await cardMoveAt(page, 150, () => page.keyboard.press(key));
    expect(state.turn).toBeGreaterThan(0.5);
    expect(await backTurningTowards(page)).toBe(towards);
  });
}

test('a scrub towards a loading variant neither darkens the drawing nor completes early', async ({
  page,
}) => {
  // Below 100% the variant needs a smaller file than its neighbour preview.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${projectPath}#image-18`);
  await waitForLightbox(page);
  await page.keyboard.press('-');
  await expect.poll(() => imageZoom(page)).toBeLessThan(1);
  await page.route('**/_responsive/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  const blackFrames = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let black = 0;
        const end = performance.now() + 2500;
        const frame = () => {
          const layer = document.querySelector('.lightbox-incoming');
          const image = layer?.querySelector('img');
          if (
            layer &&
            image &&
            Number(getComputedStyle(layer).opacity) > 0.95 &&
            !(image.complete && image.naturalWidth > 0)
          ) {
            black += 1;
          }
          if (performance.now() < end) requestAnimationFrame(frame);
          else resolve(black);
        };
        requestAnimationFrame(frame);
      }),
  );

  const paper = { x: 60, y: 300 };
  const before = await pixelAt(page, paper.x, paper.y);
  await page.mouse.move(300, 420);
  await page.mouse.down();
  await page.mouse.move(150, 420, { steps: 5 });
  await page.waitForTimeout(300);
  const during = await pixelAt(page, paper.x, paper.y);
  for (const [channel, value] of during.entries()) {
    expect(Math.abs(value - before[channel])).toBeLessThanOrEqual(4);
  }
  await page.mouse.up();
  expect(await blackFrames).toBe(0);
  await expect(page).toHaveURL(/#image-19$/);
});

test('a drag cannot redirect a blend that is already running', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const incoming = () =>
    page.evaluate(
      () => document.querySelector('img.lightbox-incoming')?.getAttribute('src') ?? '',
    );

  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(680, 400);
  await expect.poll(incoming).not.toBe('');
  const towardsNext = await incoming();
  // Held while the blend it carries on runs.
  await holdTime(page);
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(900, 400);
  expect(await incoming()).toBe(towardsNext);
  await page.clock.resume();
  await page.mouse.up();
  await expect(page).toHaveURL(/#image-4$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
});

for (const input of ['mouse', 'touch'] as const) {
  test.describe(() => {
    test.use(input === 'touch' ? touchPhone : phone);
    test.skip(
      ({ browserName }) => input === 'touch' && browserName !== 'chromium',
      'One touch-capable browser covers this',
    );

    test(`a change of image ends the ${input} drag in progress`, async ({
      page,
      context,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await gotoProject(page);
      await galleryImage(page, 2).click(); // the previous image is a different card
      await waitForLightbox(page);
      const touch = input === 'touch' ? await oneFinger(context, page) : undefined;
      const press = (x: number) =>
        touch ? touch('touchStart', x) : page.mouse.move(x, 420).then(() => page.mouse.down());
      const move = (x: number) => (touch ? touch('touchMove', x) : page.mouse.move(x, 420));
      const lift = () => (touch ? touch('touchEnd') : page.mouse.up());
      const stripX = async () =>
        (await page.locator('.lightbox-slide-current').boundingBox())!.x;

      await press(100);
      await move(200);
      await expect.poll(stripX).toBeCloseTo(100, 0);
      await page.keyboard.press('ArrowRight'); // the next image is a variant
      await move(250);
      await page.clock.runFor(500);
      await move(360);
      await lift();
      await page.clock.runFor(500);

      await expect(page).toHaveURL(/#image-3$/);
      expect(await stripX()).toBe(0);
      await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
      // A new drag follows the finger directly: back towards the variant it
      // came from, by the share of the 390 px stage it has moved.
      await press(100);
      await move(200);
      expect(
        await page.evaluate(() =>
          Number(getComputedStyle(document.querySelector('.lightbox-incoming')!).opacity),
        ),
      ).toBeCloseTo(100 / 390, 2);
      await lift();
    });
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`a short description's card is the drawing at rest (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoProject(page, '#image-18');
    await waitForLightbox(page);
    const front = (await page.locator('.lightbox-front > img').boundingBox())!;
    await page.getByRole('button', { name: 'Show description' }).click();
    await settled(page);
    const { card } = await boxes(page);
    expect(card.x).toBeCloseTo(front.x, 0);
    expect(card.y).toBeCloseTo(front.y, 0);
    expect(card.width).toBeCloseTo(front.width, 0);
    expect(card.height).toBeCloseTo(front.height, 0);
  });

  test(`a long description's card grows to fit it and scrolls as a whole (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoProject(page, '#image-12'); // 1920 × 1080
    await waitForLightbox(page);
    await page.getByRole('button', { name: 'Show description' }).click();
    await settled(page);
    const scroller = page.getByRole('region', { name: 'View 12' });
    const band = await page
      .getByRole('button', { name: 'Close' })
      .evaluate(
        (close) =>
          2 * close.getBoundingClientRect().y +
          close.getBoundingClientRect().height,
      );

    let { card, article } = await boxes(page);
    expect(card.width / card.height).toBeCloseTo(1920 / 1080, 2);
    expect(card.height).toBeGreaterThan(viewport.height);
    expect(card.width).toBeGreaterThan(viewport.width);
    expect(card.y).toBeCloseTo(band, 0);
    // The text fits the card, centred in the viewport and clear of its edges.
    expect(article.y).toBeGreaterThanOrEqual(card.y);
    expect(article.y + article.height).toBeLessThanOrEqual(
      card.y + card.height,
    );
    expect(article.x + article.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(article.x).toBeGreaterThanOrEqual(24);
    expect(article.x + article.width).toBeLessThanOrEqual(viewport.width - 24);
    // The browser's own scrollbar (headless Firefox hides every scrollbar).
    expect(
      await scroller.evaluate((element) => ({
        scrollbar: getComputedStyle(element).scrollbarWidth,
        overflows: element.scrollHeight > element.clientHeight,
      })),
    ).toEqual({
      scrollbar: await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollbarWidth,
      ),
      overflows: true,
    });

    await scroller.evaluate((element) =>
      element.scrollTo(0, element.scrollHeight),
    );
    ({ card } = await boxes(page));
    expect(card.y).toBeLessThan(0);
    expect(card.y + card.height).toBeCloseTo(viewport.height - band, 0);
  });
}

test('a long description on a square drawing grows its card on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  const band = await page
    .getByRole('button', { name: 'Close' })
    .evaluate(
      (close) =>
        2 * close.getBoundingClientRect().y +
        close.getBoundingClientRect().height,
    );
  const { card, article } = await boxes(page);
  expect(card.width / card.height).toBeCloseTo(1, 2);
  // Taller than the rest area, so it opens at its top edge below the controls.
  expect(card.height).toBeGreaterThan(844 - 2 * band);
  expect(card.y).toBeCloseTo(band, 0);
  expect(article.y + article.height).toBeLessThanOrEqual(card.y + card.height);
  expect(Math.round(article.width)).toBe(390 - 48);
});

test('flipping from a zoomed corner turns about the card and zooms out to the card', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-4');
  await waitForLightbox(page);
  const rest = (await page.locator('.lightbox-front > img').boundingBox())!;
  await page.mouse.move(rest.x + 20, rest.y + 20);
  await page.mouse.wheel(0, -1200);
  await expect
    .poll(async () => (await drawingView(page)).scale)
    .toBeGreaterThan(2);
  const zoomed = await drawingView(page);
  const zoomedTransform = await page
    .locator('.lightbox-front > img')
    .evaluate((image) => getComputedStyle(image).transform);
  const flip = page.getByRole('button', { name: 'Show description' });

  await holdTime(page);
  await flip.click();
  await page.clock.runFor(280);
  const middle = await page.evaluate(() => {
    const sheet = document.querySelector('.lightbox-slide-current [data-lightbox-sheet]')!;
    const matrix = new DOMMatrix(
      getComputedStyle(document.querySelector('.lightbox-front > img')!)
        .transform,
    );
    const front = sheet.querySelector<HTMLElement>('.lightbox-front')!;
    const [originX] = getComputedStyle(front).transformOrigin.split(' ');
    return {
      scale: matrix.a,
      x: matrix.e,
      originX: parseFloat(originX),
      sheetWidth: front.offsetWidth,
    };
  });
  expect(middle.scale).toBeLessThan(zoomed.scale);
  expect(middle.scale).toBeGreaterThan(1);
  expect(Math.abs(middle.x)).toBeLessThan(Math.abs(zoomed.x));
  expect(middle.originX).toBeCloseTo(middle.sheetWidth / 2, 0);
  await page.clock.resume();
  await settled(page);

  // The back view: the whole card, centred on the turning axis.
  expect(await drawingView(page)).toEqual({ scale: 1, x: 0, y: 0 });
  const { card } = await boxes(page);
  expect(card.x + card.width / 2).toBeCloseTo(middle.sheetWidth / 2, 0);

  await flip.click();
  await settled(page);
  expect(
    await page
      .locator('.lightbox-front > img')
      .evaluate((image) => getComputedStyle(image).transform),
  ).toBe(zoomedTransform);
});

test('flip and blend to a variant zooms back into the saved view', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  const rest = (await page.locator('.lightbox-front > img').boundingBox())!;
  await page.mouse.move(rest.x + 20, rest.y + 20);
  await page.mouse.wheel(0, -1200);
  await expect
    .poll(async () => (await drawingView(page)).scale)
    .toBeGreaterThan(2);
  const zoomed = await drawingView(page);
  const zoomedTransform = await page
    .locator('.lightbox-front > img')
    .evaluate((image) => getComputedStyle(image).transform);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);

  await cardMoveAt(page, 280, () => page.getByRole('button', { name: 'Next image' }).click());
  const middle = await drawingView(page);
  expect(middle.scale).toBeGreaterThan(1);
  expect(middle.scale).toBeLessThan(zoomed.scale);
  await page.clock.resume();

  await expect(page).toHaveURL(/#image-4$/);
  await settled(page);
  expect(
    await page
      .locator('.lightbox-front > img')
      .evaluate((image) => getComputedStyle(image).transform),
  ).toBe(zoomedTransform);
});

test('a resize while reading resizes the card and keeps the reading position', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoProject(page, '#image-8');
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  const text = page.getByRole('region', { name: 'Drawing 8' });
  const position = () =>
    text.evaluate(
      (element) =>
        element.scrollTop / (element.scrollHeight - element.clientHeight),
    );
  await text.evaluate((element) =>
    element.scrollTo(0, (element.scrollHeight - element.clientHeight) / 2),
  );
  await expect.poll(position).toBeCloseTo(0.5, 2);
  const before = (await boxes(page)).card;

  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(async () => (await boxes(page)).card.width)
    .not.toBeCloseTo(before.width, 0);
  await expect.poll(position).toBeCloseTo(0.5, 1);
});

// The rightward turn is the leftward one mirrored, from the mirrored corner.
for (const [turn, hash, rightwards] of [
  ['the toggle turning it over', '#image-3', false],
  ['Previous turning it back rightwards', '#image-4', true],
] as const) {
  test(`both faces keep one outline throughout ${turn} from a zoomed corner`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, hash);
    await waitForLightbox(page);
    const rest = (await page.locator('.lightbox-front > img').boundingBox())!;
    await page.mouse.move(rightwards ? rest.x + rest.width - 30 : rest.x + 30, rest.y + 30);
    await page.mouse.wheel(0, -1200);
    await expect
      .poll(async () => (await drawingView(page)).scale)
      .toBeGreaterThan(2);
    if (rightwards) {
      await page.getByRole('button', { name: 'Show description' }).click();
      await settled(page);
    }

    const frameAt = await pausedFlip(
      page,
      rightwards ? () => page.keyboard.press('ArrowLeft') : undefined,
    );
    const dark = async (x: number, y: number) => {
      if (x < 60 || x > 1380) return true; // under the edge arrows or off the screen
      return Math.max(...(await pixelAt(page, x, y))) < 80;
    };

    /**
     * With `face` left out, nothing is drawn where the card is: the face
     * turned away from the viewer draws nothing.
     */
    const drawsNothingWithout = async (face: string) => {
      const hidden = page.locator(`.lightbox-slide-current ${face}`);
      await hidden.evaluate((element: HTMLElement) => (element.style.display = 'none'));
      await page.waitForTimeout(100);
      for (const [x, y] of [
        [400, 300],
        [720, 450],
        [1000, 600],
      ]) {
        expect(await dark(x, y), `${face} left out`).toBe(true);
      }
      await hidden.evaluate((element: HTMLElement) => (element.style.display = ''));
    };

    // In the order the turn passes them.
    const turns = [0.1, 0.25, 0.4, 0.6, 0.75, 0.9];
    for (const turn of rightwards ? turns.reverse() : turns) {
      const { card, front } = await frameAt(turn);
      expect(card.x).toBeCloseTo(front.x, 0);
      expect(card.width).toBeCloseTo(front.width, 0);
      expect(card.y).toBeCloseTo(front.y, 0);
      expect(card.height).toBeCloseTo(front.height, 0);
      await page.waitForTimeout(100);
      const middle = Math.min(Math.max(card.y + card.height / 2, 100), 800);
      // Beside the card only the backdrop shows: no drawing, and no light back.
      expect(await dark(card.x - 6, middle)).toBe(true);
      expect(await dark(card.x + card.width + 6, middle)).toBe(true);
      // While the drawing faces the viewer the card is not drawn at all, and
      // while the back does, the drawing is not.
      if (turn === 0.25) await drawsNothingWithout('.lightbox-front');
      if (turn === 0.75) await drawsNothingWithout('.lightbox-back');
    }
  });
}

for (const [name, hash] of [
  ['a wide drawing', '#image-12'],
  ['a square drawing', '#image-8'],
] as const) {
  test(`mid-turn a card larger than the screen keeps its full outline (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, hash);
    await waitForLightbox(page);
    const frameAt = await pausedFlip(page);
    // A point may fall on a line of text, so the card shows within a line's
    // height of it.
    const surface = async (x: number, y: number) => {
      const png = await page.screenshot({
        clip: { x, y: y - 16, width: 1, height: 32 },
      });
      const pixels = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      const { channels } = pixels.info;
      for (let at = 0; at < pixels.data.length; at += channels) {
        if (Math.min(...pixels.data.subarray(at, at + 3)) > 230) return true;
      }
      return false;
    };
    const dark = async (x: number, y: number) =>
      Math.max(...(await pixelAt(page, x, y))) < 80;

    for (const turn of [0.6, 0.75, 0.9]) {
      const { card } = await frameAt(turn);
      // The card turns about the screen's vertical centre line, where
      // perspective leaves its top and bottom edges where they would lie flat.
      const { flat, view } = await page
        .locator('.lightbox-card')
        .evaluate((element: HTMLElement) => {
          element.style.setProperty('--lightbox-back-angle', '0deg');
          const { y, height } = element.getBoundingClientRect();
          element.style.removeProperty('--lightbox-back-angle');
          // The scroller spans the screen, with any gutters on both sides.
          const { clientWidth } = element.closest('[data-lightbox-scroll]')!;
          const gutter = (innerWidth - clientWidth) / 2;
          return {
            flat: { top: y, bottom: y + height },
            view: { left: gutter, right: innerWidth - gutter },
          };
        });
      await page.waitForTimeout(100);
      // Just inside the outline, within the screen beside any scrollbar
      // gutters: the card surface.
      const left = Math.max(card.x + 6, view.left + 4);
      const right = Math.min(card.x + card.width - 6, view.right - 4);
      const top = Math.max(flat.top + 6, 70);
      const bottom = Math.min(flat.bottom - 6, 774);
      // Clear of the edge arrows, which step aside during the turn.
      const middle = top + (bottom - top) / 4;
      expect(await surface(left, middle)).toBe(true);
      expect(await surface(right, middle)).toBe(true);
      expect(await surface(195, top)).toBe(true);
      expect(await surface(195, bottom)).toBe(true);
      // Just beyond an edge that is on screen: the backdrop.
      if (card.x > 10) expect(await dark(card.x - 6, middle)).toBe(true);
      if (flat.top > 76) expect(await dark(195, flat.top - 6)).toBe(true);
    }
  });
}

test("with classic scrollbars the back's scrollbar shows only while the back faces the viewer", async ({
  playwright,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'only Chromium hides scrollbars by a launch flag');
  const browser = await playwright.chromium.launch({
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage({
      baseURL: test.info().project.use.baseURL,
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'no-preference',
    });
    await gotoProject(page, '#image-12');
    await waitForLightbox(page);
    const scroller = page.locator('.lightbox-verso');
    const scrollbarShows = async () => {
      const { right, gutter } = await scroller.evaluate((element: HTMLElement) => ({
        right: element.getBoundingClientRect().right,
        gutter: (element.offsetWidth - element.clientWidth) / 2,
      }));
      expect(gutter).toBeGreaterThan(0);
      // Between the close button and the edge arrow.
      const clip = { x: right - gutter, y: 100, width: gutter, height: 300 };
      await page.waitForTimeout(100);
      const shown = await page.screenshot({ clip });
      await scroller.evaluate((element: HTMLElement) => (element.style.visibility = 'hidden'));
      await page.waitForTimeout(100);
      const hidden = await page.screenshot({ clip });
      await scroller.evaluate((element: HTMLElement) => (element.style.visibility = ''));
      return !shown.equals(hidden);
    };

    await settled(page);
    const overAt = await pausedFlip(page);
    for (const [turn, shows] of [
      [0.1, false],
      [0.3, false],
      [0.6, true],
      [0.9, true],
    ] as const) {
      await overAt(turn);
      expect(await scrollbarShows(), `turning over, at ${turn}`).toBe(shows);
    }
    await page.clock.resume();
    await settled(page);

    const backAt = await pausedFlip(page);
    for (const [turn, shows] of [
      [0.9, true],
      [0.6, true],
      [0.3, false],
      [0.1, false],
    ] as const) {
      await backAt(turn);
      expect(await scrollbarShows(), `turning back, at ${turn}`).toBe(shows);
    }
  } finally {
    await browser.close();
  }
});

test('an image without responsive variants still turns over to its description', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-17');
  await waitForLightbox(page);
  const drawing = page.locator('.lightbox-front > img');
  await expect(drawing).toHaveJSProperty('complete', true);
  await settled(page);
  const { rest, band } = await drawing.evaluate((image: HTMLImageElement) => {
    const { x, y, width, height } = image.getBoundingClientRect();
    const dialog = image.closest<HTMLElement>('.lightbox')!;
    return {
      rest: { x, y, width, height },
      band: parseFloat(dialog.style.getPropertyValue('--lightbox-band')),
    };
  });
  // Like every drawing, it rests inside the area between the control bands.
  expect(rest.width).toBeGreaterThan(0);
  expect(rest.y).toBeGreaterThanOrEqual(band - 0.5);
  expect(rest.y + rest.height).toBeLessThanOrEqual(900 - band + 0.5);

  const flip = page.getByRole('button', { name: 'Show description' });
  await expect(flip).toBeVisible();
  const frameAt = await pausedFlip(page);
  // A short text's card is the drawing at rest, so the turn moves nothing.
  for (const turn of [0.25, 0.5, 0.75]) {
    await frameAt(turn);
    const flat = await page.locator('.lightbox-card').evaluate((card: HTMLElement) => {
      card.style.setProperty('--lightbox-back-angle', '0deg');
      const { x, y, width, height } = card.getBoundingClientRect();
      card.style.removeProperty('--lightbox-back-angle');
      return { x, y, width, height };
    });
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(flat[key], `${key} at ${turn}`).toBeCloseTo(rest[key], 0);
    }
  }
  await page.clock.resume();
  await settled(page);
  await expect(page.getByRole('region', { name: 'Vector 17' })).toBeVisible();
  const { card } = await boxes(page);
  expect(card.width).toBeCloseTo(rest.width, 0);
  expect(card.height).toBeCloseTo(rest.height, 0);
  const scroll = await page
    .locator('.lightbox-verso')
    .evaluate((scroller) => [scroller.scrollHeight, scroller.clientHeight]);
  expect(scroll[0]).toBe(scroll[1]);
});

test('a web font that arrives while reading re-sizes the card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoProject(page, '#image-8');
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  const slackBeyondPadding = () =>
    page.evaluate(() => {
      const card = document
        .querySelector('.lightbox-card')!
        .getBoundingClientRect();
      const article = document
        .querySelector('.lightbox-card article')!
        .getBoundingClientRect();
      // cardPadding: 6% of the card's width within 24–64 px, above and below.
      const padding = Math.min(64, Math.max(24, 0.06 * card.width));
      return Math.round(card.height - article.height - 2 * padding);
    });
  expect(await slackBeyondPadding()).toBe(0);
  const before = (await boxes(page)).card;

  // A face that finishes loading now and sets the text larger, as a late
  // subset does with different metrics.
  await page.evaluate(async () => {
    const rule = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find(
        (candidate): candidate is CSSFontFaceRule =>
          candidate instanceof CSSFontFaceRule &&
          candidate.style
            .getPropertyValue('unicode-range')
            .startsWith('U+0-FF'),
      )!;
    const face = new FontFace(
      'Roboto Variable',
      rule.style.getPropertyValue('src'),
      {
        unicodeRange: 'U+0-FF',
        sizeAdjust: '130%',
      } as FontFaceDescriptors,
    );
    document.fonts.add(face);
    await face.load();
  });
  await expect.poll(slackBeyondPadding).toBe(0);
  expect((await boxes(page)).card.height).toBeGreaterThan(before.height + 100);
});

test('the card back is the page surface in either theme, following a live switch', async ({
  page,
}) => {
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  const colours = () =>
    page.evaluate(() => {
      const card = getComputedStyle(document.querySelector('.lightbox-card')!);
      const body = getComputedStyle(document.body);
      return {
        card: [card.backgroundColor, card.color],
        page: [body.backgroundColor, body.color],
      };
    });

  let seen = await colours();
  expect(seen.card).toEqual(seen.page);
  expect(seen.card).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);

  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  seen = await colours();
  expect(seen.card).toEqual(seen.page);
  expect(seen.card).not.toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
  // The lightbox itself stays black and white.
  expect(
    await page
      .getByRole('button', { name: 'Close' })
      .evaluate((close) => getComputedStyle(close).backgroundColor),
  ).toBe('rgb(0, 0, 0)');
});

test('a variant fading in on the back uses the themed card too', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  await cardMoveAt(page, 200, () => page.getByRole('button', { name: 'Next image' }).click());
  const [incoming, surface] = await page.evaluate(() => [
    getComputedStyle(
      document.querySelector(
        '.lightbox-back .lightbox-incoming .lightbox-card',
      )!,
    ).backgroundColor,
    getComputedStyle(document.body).backgroundColor,
  ]);
  expect(incoming).toBe(surface);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`a pressed control keeps a black ring on any surface (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    const flip = page.getByRole('button', { name: 'Show description' });
    await flip.click();
    await expect(flip).toHaveAttribute('aria-pressed', 'true');
    await settled(page);
    const box = (await flip.boundingBox())!;
    const middle = box.y + box.height / 2;
    // The fill is white; just outside it the ring is black, over the light card
    // on a phone and over the backdrop on a wide screen.
    expect(
      Math.min(...(await pixelAt(page, box.x + box.width / 2, box.y + 4))),
    ).toBeGreaterThan(230);
    // Whole pixels that lie fully inside the 2 px ring at a fractional edge.
    for (const x of [
      Math.floor(box.x - 1.5),
      Math.floor(box.x + box.width + 0.5),
    ]) {
      expect(Math.max(...(await pixelAt(page, x, middle)))).toBeLessThanOrEqual(
        5,
      );
    }
  });
}

test('with reduced motion the zoom-aware flip is instant', async ({ page }) => {
  await gotoProject(page, '#image-4');
  await waitForLightbox(page);
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect
    .poll(async () => (await drawingView(page)).scale)
    .toBeCloseTo(1.5625, 3);
  const flip = page.getByRole('button', { name: 'Show description' });

  await flip.click();
  expect(await drawingView(page)).toEqual({ scale: 1, x: 0, y: 0 });
  await settled(page);
  await flip.click();
  expect((await drawingView(page)).scale).toBeCloseTo(1.5625, 3);
});

test('reading a long description leaves the drawing view and its tiles alone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoProject(page, '#image-8');
  await waitForLightbox(page);
  await page.locator('.openseadragon-canvas canvas').waitFor();
  await page.keyboard.press('+');
  await expect
    .poll(async () => (await drawingView(page)).scale)
    .toBeCloseTo(1.25, 3);
  const zoomedTransform = await page
    .locator('.lightbox-front > img')
    .evaluate((image) => getComputedStyle(image).transform);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  await page.waitForTimeout(300);

  const tiles: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/image_files/')) tiles.push(request.url());
  });
  const text = page.getByRole('region', { name: 'Drawing 8' });
  await text.evaluate((element) => element.scrollTo(0, 600));
  expect((await boxes(page)).card.y).toBeLessThan(0);
  await page.waitForTimeout(500);
  expect(tiles).toEqual([]);

  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  expect(
    await page
      .locator('.lightbox-front > img')
      .evaluate((image) => getComputedStyle(image).transform),
  ).toBe(zoomedTransform);
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('with reduced motion a change to a variant is instant', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoProject(page);
    await galleryImage(page, 3).click();
    await waitForLightbox(page);
    const changed = () =>
      page.evaluate(() => ({
        hash: location.hash,
        blending: Boolean(document.querySelector('.lightbox-incoming')),
        turning: document
          .querySelector<HTMLElement>('.lightbox-slide-current [data-lightbox-sheet]')!
          .style.getPropertyValue('--lightbox-turn'),
      }));

    const touch = await oneFinger(context, page);
    await touch('touchStart', 300);
    await touch('touchMove', 200);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await changed()).toEqual({ hash: '#image-3', blending: false, turning: '0' });
    expect((await page.locator('.lightbox-slide-current').boundingBox())!.x).toBe(0);
    await touch('touchEnd');
    await expect(page).toHaveURL(/#image-4$/);
    expect(await changed()).toEqual({ hash: '#image-4', blending: false, turning: '0' });

    // A variant keeps the inspected view.
    await page.keyboard.press('+');
    await expect.poll(() => imageZoom(page)).toBeCloseTo(1.25, 2);
    await page
      .getByRole('button', { name: 'Next image' })
      .evaluate((button: HTMLButtonElement) => button.click());
    expect(await changed()).toEqual({ hash: '#image-5', blending: false, turning: '0' });
    expect(await imageZoom(page)).toBeCloseTo(1.25, 2);
  });
});

test('resizing while the description shows reflows the text and its arrows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  const paragraph = page
    .getByRole('region', { name: 'Tiled variant 3' })
    .locator('p');
  const next = page.getByRole('button', { name: 'Next image' });
  await expect(next).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => Math.round((await paragraph.boundingBox())!.width))
    .toBe(390 - 48);
  await expect(next).toBeHidden();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(next).toBeVisible();
  const text = (await page
    .getByRole('region', { name: 'Tiled variant 3' })
    .locator('article')
    .boundingBox())!;
  const nextBox = (await next.boundingBox())!;
  expect(text.x + text.width).toBeLessThanOrEqual(nextBox.x);
  await expect(
    page.getByRole('button', { name: 'Show description' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('double-click zooms in at the pointer and back to rest', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const bounds = (await page
    .locator('.lightbox-slide-current img')
    .boundingBox())!;
  const point = {
    x: bounds.x + bounds.width * 0.4,
    y: bounds.y + bounds.height * 0.4,
  };
  const imagePointAt = () =>
    page.locator('.lightbox-slide-current img').evaluate(
      (image: HTMLImageElement, { x, y }) => {
        const box = image.getBoundingClientRect();
        return { x: (x - box.x) / box.width, y: (y - box.y) / box.height };
      },
      point,
    );
  const before = await imagePointAt();

  await page.mouse.dblclick(point.x, point.y);
  await expect.poll(() => imageZoom(page)).toBeCloseTo(2.5, 2);
  const after = await imagePointAt();
  expect(after.x).toBeCloseTo(before.x, 2);
  expect(after.y).toBeCloseTo(before.y, 2);
  await expect(page).toHaveURL(/#image-3$/);

  await page.mouse.dblclick(point.x, point.y);
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1, 2);
});

test('keys zoom the drawing and 0 returns to rest', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.keyboard.press('+');
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1.25, 2);
  await page.keyboard.press('=');
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1.5625, 2);
  await page.keyboard.press('-');
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1.25, 2);
  await page.keyboard.press('0');
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1, 2);

  await page.getByRole('button', { name: 'Show description' }).click();
  await page.keyboard.press('+');
  await page.getByRole('button', { name: 'Show description' }).click();
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
});

test('zoom keys, like the wheel, wait for a drag at rest to end', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);
  const bounds = (await page.locator('.lightbox-stage').boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 30, y);
  await page.keyboard.press('+');
  await page.mouse.wheel(0, -400);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);

  await page.mouse.up();
  await expect(page).toHaveURL(/#image-10$/);
  await page.keyboard.press('+');
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1.25, 2);
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('double-tap zooms on touch screens', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoProject(page);
    await galleryImage(page, 3).click();
    await waitForLightbox(page);
    // The page tells a double tap by when its events arrive, so both taps are
    // sent in one go rather than each waiting on the last.
    const session = await context.newCDPSession(page);
    const doubleTap = () =>
      Promise.all(
        (['touchStart', 'touchEnd', 'touchStart', 'touchEnd'] as const).map((type) =>
          session.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchStart' ? [{ x: 195, y: 420 }] : [],
          }),
        ),
      );
    await doubleTap();
    await expect.poll(() => imageZoom(page)).toBeCloseTo(2.5, 2);
    await expect(page).toHaveURL(/#image-3$/);

    await doubleTap();
    await expect.poll(() => imageZoom(page)).toBeCloseTo(1, 2);
  });
});

// State changes instantly; the visuals chase it.

/** The position the lightbox reports, and the one its original link shows. */
function positions(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-gallery-lightbox]')!;
    return [
      dialog.querySelector('[role="status"]')!.textContent!.trim(),
      dialog.querySelector('a[target="_blank"]')!.textContent!.replace(/\s+/g, ' ').trim(),
    ];
  });
}

test('each of five quick presses changes image at once; Back then closes and Forward reopens the last', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-1');
  await waitForLightbox(page);
  // A slide to the set, then blends through it.
  for (const position of [2, 3, 4, 5, 6]) {
    await page.keyboard.press('ArrowRight');
    expect(await positions(page)).toEqual([`${position} / ${total}`, `${position} / ${total}`]);
  }
  await expect(page).toHaveURL(/#image-6$/);
  await expect(page.locator('[aria-current="true"]')).toHaveText('Tiled variant 6');

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
  await page.goForward();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-6$/);
  expect(await positions(page)).toEqual([`6 / ${total}`, `6 / ${total}`]);
});

/**
 * Holds time on a frame and reads `read` there and after each frame that
 * `step` moves the page's clock on, 16 ms apart. Stepped
 * frame by frame, what a frame shows does not depend on how busy the machine
 * is; starting on one, a change made between steps is a whole frame from the
 * next.
 */
async function recording<T>(page: Page, read: () => Promise<T>) {
  await holdTime(page);
  const now = await page.evaluate(() => performance.now());
  const frame = page.evaluate(
    () => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now()))),
  );
  await page.clock.runFor(16);
  await page.clock.runFor((await frame) - now);
  const frames = [await read()];
  const step = async (count: number) => {
    for (let frame = 0; frame < count; frame += 1) {
      await page.clock.runFor(16);
      frames.push(await read());
    }
  };
  return { frames, step };
}

/** Where the strip is, in stage widths, and whether its slides cover the stage edge to edge. */
function stripNow(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector('.lightbox-strip')!;
    const slides = [...document.querySelectorAll('.lightbox-slide')]
      .map((slide) => slide.getBoundingClientRect())
      .filter((box) => box.right > 0.5 && box.left < innerWidth - 0.5)
      .sort((a, b) => a.left - b.left);
    return {
      x: strip.getBoundingClientRect().x / innerWidth,
      covered:
        slides.length > 0 &&
        slides[0].left <= 0.5 &&
        slides.at(-1)!.right >= innerWidth - 0.5 &&
        slides.every((box, at) => at === 0 || Math.abs(box.left - slides[at - 1].right) < 1),
    };
  });
}

/** Every step between frames. */
function steps(values: number[]) {
  return values.slice(1).map((value, at) => value - values[at]);
}

/**
 * The steps between frames at which a value that was moving jumped: it moved
 * further than `floor`, over twice as far as in the frames either side. A move
 * under way changes speed gradually, however it eases; a jump stands out. A
 * move from rest may start at speed.
 */
function jumps(values: number[], floor = 0.15) {
  const moved = steps(values).map(Math.abs);
  return moved.flatMap((step, at) => {
    const around = [moved[at - 1] ?? 0, moved[at + 1] ?? 0];
    return step > floor && around[0] > 0 && step > 2 * Math.max(...around)
      ? [{ at, values: values.slice(Math.max(0, at - 2), at + 4) }]
      : [];
  });
}

test('a second change mid-slide carries the strip on from where it is, with no gap between cards', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-11');
  await waitForLightbox(page);
  const strip = await recording(page, () => stripNow(page));
  await page.keyboard.press('ArrowRight');
  await strip.step(2);
  await page.keyboard.press('ArrowRight');
  expect(await positions(page)).toEqual([`13 / ${total}`, `13 / ${total}`]);
  await strip.step(20);

  const xs = strip.frames.map(({ x }) => x);
  // Leftwards all the way, two cards on, without a jump or a gap.
  for (const step of steps(xs)) expect(step).toBeLessThanOrEqual(0.001);
  expect(jumps(xs)).toEqual([]);
  expect(xs.at(-1)! - xs[0]).toBeCloseTo(-2, 2);
  expect(strip.frames.every(({ covered }) => covered)).toBe(true);
});

test('turning back mid-slide returns the strip from where it is, and Next at the end wraps onwards', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, `#image-${total - 1}`);
  await waitForLightbox(page);
  let strip = await recording(page, () => stripNow(page));
  await page.keyboard.press('ArrowRight');
  // Early, but once it is on its way.
  while (strip.frames.at(-1)!.x > -0.02) await strip.step(1);
  const pressed = strip.frames.length - 1;
  await page.keyboard.press('ArrowLeft');
  expect(await positions(page)).toEqual([`${total - 1} / ${total}`, `${total - 1} / ${total}`]);
  await strip.step(20);
  let xs = strip.frames.map(({ x }) => x);
  expect(jumps(xs)).toEqual([]);
  for (const [at, step] of steps(xs).entries()) {
    // Out and back once: leftwards until it was pressed, rightwards after.
    if (at < pressed) expect(step).toBeLessThanOrEqual(0.001);
    else expect(step).toBeGreaterThanOrEqual(-0.001);
  }
  expect(xs.at(-1)!).toBeCloseTo(xs[0], 2);

  // From the last image Next travels on to the first, never back across: one
  // slide if the last image was changed away from before it came into view,
  // two if it had.
  strip = await recording(page, () => stripNow(page));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await positions(page)).toEqual([`1 / ${total}`, `1 / ${total}`]);
  await strip.step(20);
  xs = strip.frames.map(({ x }) => x);
  for (const step of steps(xs)) expect(step).toBeLessThanOrEqual(0.001);
  const travelled = xs.at(-1)! - xs[0];
  expect([-1, -2]).toContain(Math.round(travelled));
  expect(travelled).toBeCloseTo(Math.round(travelled), 2);
});

/**
 * How much of the drawing side each image shows, keyed by its source, from
 * the opacity of each drawn layer.
 */
function blendNow(page: Page) {
  return page.evaluate(() => {
    const front = document.querySelector('.lightbox-slide-current .lightbox-front')!;
    const shares: Record<string, number> = {};
    let left = 1;
    for (const layer of [...front.querySelectorAll('img')].reverse()) {
      const share = Number(getComputedStyle(layer).opacity) * left;
      const src = decodeURIComponent(new URL(layer.src).pathname);
      shares[src] = (shares[src] ?? 0) + share;
      left -= share;
    }
    return shares;
  });
}

/**
 * Where the blend is in each frame, as the images it shows in the order they
 * first show, each weighted by its share (0 fully the first, 1 fully the
 * second, and so on).
 */
function blendAt(frames: Record<string, number>[]) {
  const order = [...new Set(frames.flatMap((shares) => Object.keys(shares)))];
  return frames.map((shares) => order.reduce((sum, src, at) => sum + at * (shares[src] ?? 0), 0));
}

for (const [route, second, expected] of [
  ['on to another variant', 'ArrowRight', `5 / ${total}`],
  ['back', 'ArrowLeft', `3 / ${total}`],
] as const) {
  test(`a change mid-blend ${route} carries on from the mix on screen`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    const blend = await recording(page, () => blendNow(page));
    await page.keyboard.press('ArrowRight');
    await drawingsLoaded(page);
    await blend.step(2);
    const pressed = blend.frames.length - 1;
    await page.keyboard.press(second);
    expect(await positions(page)).toEqual([expected, expected]);
    await drawingsLoaded(page);
    await blend.step(20);
    await page.clock.resume();
    const seen = blend.frames;
    const at = blendAt(seen);
    expect(jumps(at)).toEqual([]);
    // Onwards all the way, or back from the mix shown when it was pressed.
    const turn = second === 'ArrowRight' ? at.length : pressed;
    for (const [frame, step] of steps(at).entries()) {
      if (frame < turn) expect(step).toBeGreaterThanOrEqual(-0.001);
      else expect(step).toBeLessThanOrEqual(0.001);
    }
    const [[before]] = Object.entries(seen[0]).sort((a, b) => b[1] - a[1]);
    // Past a third image, or back to the first, which it then shows alone.
    const shown = new Set(seen.flatMap((shares) => Object.keys(shares)));
    expect(shown.size).toBe(second === 'ArrowRight' ? 3 : 2);
    await settled(page);
    const last = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')].map(
        (image) => decodeURIComponent(new URL(image.src).pathname),
      ),
    );
    expect(last).toHaveLength(1);
    expect(last[0] === before).toBe(second === 'ArrowLeft');
  });
}

/** The current card's turn: 0 drawing side up, 1 text side up. */
function turnNow(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('.lightbox-slide-current [data-lightbox-sheet]')!;
    return Number(getComputedStyle(sheet).getPropertyValue('--lightbox-turn'));
  });
}

test('the toggle reversed mid-turn turns back from where the card is', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  const toggle = page.getByRole('button', { name: 'Show description' });
  const turns = await recording(page, () => turnNow(page));
  await toggle.click();
  while (turns.frames.at(-1)! < 0.2) await turns.step(1);
  expect(turns.frames.at(-1)).toBeLessThan(0.6);
  const pressed = turns.frames.length - 1;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await turns.step(40);
  const seen = turns.frames;
  const top = Math.max(...seen);
  expect(seen.indexOf(top)).toBe(pressed);
  expect(top).toBeLessThan(0.9);
  for (const step of steps(seen)) expect(Math.abs(step)).toBeLessThan(0.25);
  expect(seen.at(-1)).toBe(0);
});

test('a drag that starts mid-slide takes the strip from where it is', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-11');
  await waitForLightbox(page);
  const stripX = () =>
    page.evaluate(() => document.querySelector('.lightbox-slide-current')!.getBoundingClientRect().x);
  await page.mouse.move(640, 400);
  await holdTime(page);
  await page.keyboard.press('ArrowRight');
  await page.clock.runFor(60);
  await page.mouse.down();
  const grabbed = await stripX();
  expect(grabbed).toBeGreaterThan(0);
  await page.mouse.move(630, 400);
  await page.clock.runFor(16);
  expect(await stripX()).toBeCloseTo(grabbed - 10, 0);
  // Held, it stays under the finger.
  await page.clock.resume();
  await page.waitForTimeout(250);
  expect(await stripX()).toBeCloseTo(grabbed - 10, 0);
  await page.mouse.up();
  await expect.poll(stripX).toBeCloseTo(0, 0);
  expect(await positions(page)).toEqual([`12 / ${total}`, `12 / ${total}`]);
});

test('a drag that starts mid-blend takes the blend from where it is', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  const incoming = () =>
    page.evaluate(() => {
      const layer = document.querySelector('.lightbox-slide-current .lightbox-front .lightbox-incoming');
      return layer ? Number(getComputedStyle(layer).opacity) : 0;
    });
  await page.mouse.move(640, 400);
  await holdTime(page);
  await page.keyboard.press('ArrowRight');
  await drawingsLoaded(page);
  await page.clock.runFor(60);
  await page.mouse.down();
  const grabbed = await incoming();
  expect(grabbed).toBeGreaterThan(0);
  expect(grabbed).toBeLessThan(1);
  await page.mouse.move(638, 400);
  await page.clock.resume();
  await page.waitForTimeout(250);
  expect(await incoming()).toBeCloseTo(grabbed, 1);
  await page.mouse.up();
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  expect(await positions(page)).toEqual([`4 / ${total}`, `4 / ${total}`]);
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('a drag on the text that starts mid-turn takes the turn from where it is', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    const touch = await oneFinger(context, page);
    const turn = () =>
      page.evaluate(() =>
        Number(
          getComputedStyle(
            document.querySelector('.lightbox-slide-current [data-lightbox-sheet]')!,
          ).getPropertyValue('--lightbox-turn'),
        ),
      );
    await holdTime(page);
    await page.getByRole('button', { name: 'Show description' }).click();
    while ((await turn()) <= 0.2) await page.clock.runFor(16);
    await touch('touchStart', 300);
    const grabbed = await turn();
    expect(grabbed).toBeGreaterThan(0.05);
    expect(grabbed).toBeLessThan(0.95);
    await touch('touchMove', 298);
    await page.clock.runFor(32);
    expect(await turn()).toBeCloseTo(grabbed, 1);
    await page.clock.runFor(250);
    expect(await turn()).toBeCloseTo(grabbed, 1);
    await touch('touchEnd');
    await page.clock.resume();
    await expect.poll(turn).toBe(1);
  });
});

test('an image still loading delays only its blend: state and further changes go on at once', async ({
  page,
}) => {
  // Below 100% a variant needs a smaller file than its neighbour preview.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-18');
  await waitForLightbox(page);
  await page.keyboard.press('-');
  await expect.poll(() => imageZoom(page)).toBeLessThan(1);
  await settled(page);
  const before = await page.locator('.lightbox-front > img').first().getAttribute('src');
  await page.route('**/_responsive/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  const blend = await recording(page, () => blendNow(page));
  await page.keyboard.press('ArrowRight');
  expect(await positions(page)).toEqual([`19 / ${total}`, `19 / ${total}`]);
  await page.keyboard.press('ArrowRight');
  expect(await positions(page)).toEqual([`20 / ${total}`, `20 / ${total}`]);
  await blend.step(20);
  await drawingsLoaded(page);
  await blend.step(20);
  // The skipped variant never showed, the drawing never darkened, and the
  // blend ran only once the last one had loaded.
  const shown = new Set(
    blend.frames.flatMap((shares) => Object.keys(shares).filter((src) => shares[src] > 0.001)),
  );
  expect(shown.size).toBe(2);
  expect(shown.has(decodeURIComponent(new URL(before!, page.url()).pathname))).toBe(true);
  for (const shares of blend.frames) {
    expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 3);
  }
  await expect(page).toHaveURL(/#image-20$/);
});

test.describe(() => {
  test.use(phone);

  test('on a phone the edge arrows wait with the card for a variant still loading', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-18');
    await waitForLightbox(page);
    // Zoomed in, the variant needs a larger file than the page's thumbnails and
    // its neighbour preview have loaded.
    await page.keyboard.press('+');
    await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
    const next = page.getByRole('button', { name: 'Next image', includeHidden: true });
    const toggle = page.getByRole('button', { name: 'Show description' });
    await toggle.click();
    await settled(page);
    await expect(next).toBeHidden();
    let release = () => {};
    const arrived = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/_responsive/**', async (route) => {
      await arrived;
      await route.continue();
    });
    await page.keyboard.press('ArrowRight');
    expect(await positions(page)).toEqual([`19 / ${total}`, `19 / ${total}`]);
    await page.clock.runFor(400);
    expect(await sheetTurn(page)).toBeCloseTo(-1, 3);
    await expect(next).toBeHidden();
    // Once it has loaded, both come back together.
    release();
    await expect.poll(() => sheetTurn(page)).toBeCloseTo(1, 3);
    await expect(next).toBeVisible();
  });
});

/**
 * Watches for `ms` how many tiled viewers are created while the strip or a
 * card is still moving, and the most there are at once.
 */
function viewersCreatedMidMove(page: Page, ms: number) {
  return page.evaluate(
    (duration) =>
      new Promise<{ midMove: number; most: number }>((resolve) => {
        // The strip between slides, a card between layers or sides, or the
        // lightbox opening.
        const moving = () => {
          const strip = document.querySelector<HTMLElement>('.lightbox-strip')!.style.transform;
          const along = Number(/-?[\d.]+(?=%)/.exec(strip)?.[0] ?? 0) / 100;
          const sheet = document.querySelector<HTMLElement>(
            '.lightbox-slide-current [data-lightbox-sheet]',
          );
          const turn = Number(sheet?.style.getPropertyValue('--lightbox-turn'));
          const open = Number(
            document
              .querySelector<HTMLElement>('[data-gallery-lightbox]')!
              .style.getPropertyValue('--lightbox-open'),
          );
          return (
            !Number.isInteger(along) ||
            (turn !== 0 && turn !== 1) ||
            (sheet?.querySelectorAll('.lightbox-front > img').length ?? 0) > 1 ||
            open !== 1
          );
        };
        let midMove = 0;
        let most = 0;
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node instanceof Element && node.matches('.openseadragon-container') && moving()) {
                midMove += 1;
              }
            }
          }
          most = Math.max(most, document.querySelectorAll('.openseadragon-container').length);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve({ midMove, most });
        }, duration);
      }),
    ms,
  );
}

test('a blend onto a tiled variant runs frame by frame, its tiles starting once it rests', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  await page.locator('.openseadragon-canvas canvas').waitFor();
  // Drawing the first tiles is a burst of work of its own.
  await page.waitForTimeout(1000);
  const blend = await recording(page, () => blendNow(page));
  const created = viewersCreatedMidMove(page, 1200);
  await page.keyboard.press('ArrowRight');
  await drawingsLoaded(page);
  await blend.step(20);
  const mid = blend.frames.filter((shares) =>
    Object.values(shares).every((share) => share < 0.98),
  );
  // 180 ms at 60 frames a second, with a few to spare.
  expect(mid.length).toBeGreaterThanOrEqual(6);
  expect(jumps(blendAt(blend.frames))).toEqual([]);
  await page.clock.runFor(900);
  expect((await created).midMove).toBe(0);
  await page.clock.resume();
  await expect(page.locator('.openseadragon-container')).toHaveCount(1);
});

test('tiled viewers stay bounded through a fast run of changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-2');
  await waitForLightbox(page);
  await page.locator('.openseadragon-canvas canvas').waitFor();
  const created = viewersCreatedMidMove(page, 1500);
  for (let press = 0; press < 7; press += 1) await page.keyboard.press('ArrowRight');
  expect(await positions(page)).toEqual([`9 / ${total}`, `9 / ${total}`]);
  const { midMove, most } = await created;
  expect(midMove).toBe(0);
  // The one sliding away, and the one it rests on.
  expect(most).toBeLessThanOrEqual(2);
  await settled(page);
  await expect(page.locator('.openseadragon-container')).toHaveCount(1);
});

test('a tiled canvas whose code arrives while its card moves on waits for the card to rest', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let asked = () => {};
  const requested = new Promise<void>((resolve) => (asked = resolve));
  let release = () => {};
  const arrived = new Promise<void>((resolve) => (release = resolve));
  let code = '';
  await page.route('**/_astro/openseadragon.*.js', async (route) => {
    code = route.request().url();
    asked();
    await arrived;
    await route.continue();
  });
  await gotoProject(page, '#image-2');
  await waitForLightbox(page);
  // At rest, the card's tiled canvas has asked for OpenSeadragon.
  await requested;
  await holdTime(page);
  await page.keyboard.press('ArrowRight'); // a variant, which blends in
  release();
  // Resolves after the canvas's own import of the same module.
  await page.evaluate((url) => import(url).then(() => {}), code);
  expect(
    await page.evaluate(() => ({
      blending:
        document.querySelectorAll('.lightbox-slide-current .lightbox-front > img').length > 1,
      viewers: document.querySelectorAll('.openseadragon-container').length,
    })),
  ).toEqual({ blending: true, viewers: 0 });
  await page.clock.resume();
  await expect(page.locator('.openseadragon-container')).toHaveCount(1);
});

test('the toggle tapped while a card slides in turns that card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-6'); // the next image is another card, with a description
  await waitForLightbox(page);
  const toggle = page.getByRole('button', { name: 'Show description' });
  await toggle.click();
  await settled(page);
  const turns = await recording(page, () => turnNow(page));
  await page.keyboard.press('ArrowRight');
  await toggle.evaluate((button: HTMLButtonElement) => button.click());
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await turns.step(40);
  const seen = turns.frames;
  expect(seen.some((turn) => turn > 0.1 && turn < 0.9)).toBe(true);
  expect(seen.at(-1)).toBe(1);
  await expect(page.getByRole('region', { name: 'Drawing 7' })).toBeVisible();
});

test('reduced motion reaches the same states at the same moments', async ({ browser }) => {
  const run = async (reducedMotion: 'reduce' | 'no-preference') => {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion });
    await gotoProject(page, '#image-1');
    await waitForLightbox(page);
    const states = [];
    const toggle = page.getByRole('button', { name: 'Show description' });
    for (const step of [
      () => page.keyboard.press('ArrowRight'),
      () => page.keyboard.press('ArrowRight'),
      () => toggle.click(),
      () => page.keyboard.press('ArrowRight'),
      () => toggle.click(),
      () => page.keyboard.press('ArrowLeft'),
      () => page.getByRole('button', { name: 'Tiled variant 2' }).click(),
      () => page.keyboard.press('ArrowLeft'),
      () => page.keyboard.press('ArrowLeft'),
    ]) {
      await step();
      states.push(
        await page.evaluate(() => {
          const dialog = document.querySelector('[data-gallery-lightbox]')!;
          return {
            position: dialog.querySelector('[role="status"]')!.textContent!.trim(),
            current: dialog.querySelector('[aria-current="true"]')?.textContent?.trim(),
            text: dialog.querySelector('[aria-pressed]')?.getAttribute('aria-pressed'),
          };
        }),
      );
    }
    await expect(page).toHaveURL(new RegExp(`#image-${total}$`));
    await page.close();
    return states;
  };
  expect(await run('no-preference')).toEqual(await run('reduce'));
});

test.describe(() => {
  test.use(touchPhone);
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('a touch that moves over the controls leaves the page behind in place', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoProject(page, '#image-7');
    await waitForLightbox(page);
    const before = await page.evaluate(() => window.scrollY);
    const box = (await page.getByRole('link', { name: /^Open original/ }).boundingBox())!;
    const session = await context.newCDPSession(page);
    const at = (y: number) => [{ x: box.x + box.width / 2, y }];
    const start = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(start) });
    for (const step of [1, 2, 3, 4, 5, 6]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: at(start - step * 60),
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe(() => {
  test.use(phone);

  test('on a phone the edge arrows stay in step with a turn reversed mid-way', async ({
    page,
  }) => {
    // It steps some two hundred frames, each a round trip to the page.
    test.slow();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page, '#image-3');
    await waitForLightbox(page);
    const toggle = () =>
      page
        .getByRole('button', { name: 'Show description' })
        .evaluate((button: HTMLButtonElement) => button.click());
    // Reversed once and twice, and a change to a variant in the middle of the
    // turn, which blends as it turns the card back; numbers are ms between
    // the changes.
    for (const steps of [
      [toggle, 200, toggle],
      [toggle, 150, toggle, 100, toggle],
      [toggle, 250, () => page.keyboard.press('ArrowRight')],
    ] as const) {
      const apart = await recording(page, () =>
        page.evaluate(() => {
          const sheet = document.querySelector('.lightbox-slide-current [data-lightbox-sheet]')!;
          const arrow = document.querySelector('[aria-label="Next image"]')!;
          return Math.abs(
            Number(getComputedStyle(sheet).getPropertyValue('--lightbox-turn')) -
              Number(getComputedStyle(arrow).getPropertyValue('--lightbox-arrows-aside')),
          );
        }),
      );
      for (const step of steps) {
        if (typeof step === 'number') await apart.step(Math.round(step / 16));
        else await step();
      }
      await apart.step(40);
      expect(Math.max(...apart.frames)).toBeLessThan(0.02);
      await page.clock.resume();
      await settled(page);
    }
  });
});

test('Escape right after the click closes, with nothing shown and no errors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
  expect(errors).toEqual([]);
});

test('Back straight after quick presses, then Forward, reopens the last image', async ({ page }) => {
  await gotoProject(page, '#image-11');
  await waitForLightbox(page);
  await page.evaluate(() => {
    for (let press = 0; press < 3; press += 1) {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    }
    history.back();
  });
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await page.goForward();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-14$/);
  expect(await positions(page)).toEqual([`14 / ${total}`, `14 / ${total}`]);
});

test('opening, fast changes and turns log no page errors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await gotoProject(page);
  await galleryImage(page, 3).click();
  const toggle = page.getByRole('button', { name: 'Show description' });
  for (const step of [
    () => page.keyboard.press('ArrowRight'),
    () => toggle.click(),
    () => page.keyboard.press('ArrowRight'),
    () => toggle.click(),
    () => page.keyboard.press('ArrowRight'),
    () => page.keyboard.press('ArrowLeft'),
    () => toggle.click(),
    () => page.keyboard.press('ArrowRight'),
  ]) {
    await step();
  }
  await settled(page);
  expect(errors).toEqual([]);
});

test('a turn sent back mid-way keeps moving, without stalling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  const toggle = page.getByRole('button', { name: 'Show description' });
  const turned = async () => Math.acos(Math.max(-1, Math.min(1, await sheetTurn(page)))) / Math.PI;
  await holdTime(page);
  await toggle.click();
  const turns = [];
  for (let frame = 0; frame < 14; frame += 1) {
    await page.clock.runFor(16);
    turns.push(await turned());
  }
  await toggle.click();
  for (let frame = 0; frame < 4; frame += 1) {
    await page.clock.runFor(16);
    turns.push(await turned());
  }
  await page.clock.resume();
  const moved = steps(turns).map(Math.abs);
  const before = moved[12];
  // The two frames after the change move at least a third as far as the
  // frame before it.
  for (const after of moved.slice(14, 16)) expect(after).toBeGreaterThan(before / 3);
});

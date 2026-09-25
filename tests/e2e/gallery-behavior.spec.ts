import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import sharp from 'sharp';

const projectPath = '/projects/urban-study-kyjov/';

function galleryImage(page: Page, position: number, label = 'Open image') {
  return page.getByRole('button', {
    name: `${label} ${position}`,
    exact: true,
  });
}

async function gotoProject(page: Page, suffix = '') {
  await page.goto(`${projectPath}${suffix}`);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

async function waitForLightbox(page: Page, name = 'Image viewer') {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  // The lightbox ignores input until it has finished opening.
  await expect(dialog).not.toHaveAttribute('aria-busy', 'true');
}

/** Rendered width of the current lightbox image relative to its rest (100%) width. */
async function imageZoom(page: Page) {
  return page
    .locator('.lightbox-front > img')
    .evaluate(
      (image: HTMLImageElement) =>
        image.getBoundingClientRect().width / image.offsetWidth,
    );
}

/**
 * Pauses every running card move (turn and blend) at `time` ms and reports
 * the turn (1 text side up, 0 drawing side up) and each face's blend.
 */
function pausedCardMove(page: Page, time: number) {
  return page.waitForFunction((at) => {
    const sheet = document.querySelector<HTMLElement>('[data-lightbox-sheet]')!;
    const layers = [...sheet.querySelectorAll<HTMLElement>('.lightbox-incoming')];
    const animations = [sheet, ...layers].flatMap((element) => element.getAnimations());
    if (!layers.length || !animations.length) return false;
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = at;
    }
    const blend = (face: string) =>
      Number(
        getComputedStyle(sheet.querySelector(`${face} .lightbox-incoming`) ?? sheet)
          .opacity,
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
  }, time);
}

/** Horizontal scale of the current card's turn: 1 drawing side up, −1 text side up. */
async function sheetTurn(page: Page) {
  return page
    .locator('.lightbox-front')
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

/**
 * Serves `path` with test-only description text for the image uploaded as
 * `file`, by rewriting the gallery island's serialized props; `responsive:
 * false` also drops the image's responsive entry.
 */
async function withDescription(
  page: Page,
  path: string,
  file: string,
  text: string | { en: string; cs: string },
  { responsive = true } = {},
) {
  const { en, cs } = typeof text === 'string' ? { en: text, cs: text } : text;
  const decode = (value: string) =>
    value
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
  const encode = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  await page.route(
    (url) => decodeURIComponent(url.pathname) === decodeURIComponent(path),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<astro-island[^>]*? props=")([^"]*)"/,
        (_, start: string, props: string) => {
          const island = JSON.parse(decode(props));
          const at = island.images[1].findIndex(
            ([, item]: [number, { image: [number, string] }]) =>
              item.image[1] === file,
          );
          const record = island.images[1][at][1];
          record.description_en = [0, en];
          record.description_cs = [0, cs];
          // Astro serializes undefined as a bare [0].
          if (!responsive) island.responsiveImages[1][at] = [0];
          return `${start}${encode(JSON.stringify(island))}"`;
        },
      );
      await route.fulfill({ response, body });
    },
  );
}

const LONG_TEXT = Array.from(
  { length: 24 },
  () =>
    'The study follows how the square, the park and the stadium meet along the river, and where a new path could join them.',
).join(' ');

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

async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
}

/** The front drawing's computed transform, as scale and offset. */
function drawingView(page: Page) {
  return page.locator('.lightbox-front > img').evaluate((image) => {
    const matrix = new DOMMatrix(getComputedStyle(image).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
}

/**
 * Clicks the flip button with every animation paused together, so each face's
 * own timing stays in step; the returned function seeks to a turn and reports
 * the card's and the front drawing's projected boxes there.
 */
async function pausedFlip(page: Page) {
  const paused = page.waitForFunction(() => {
    const sheet = document.querySelector('[data-lightbox-sheet]')!;
    if (!sheet.getAnimations().length) return false;
    for (const animation of document.getAnimations()) animation.pause();
    return true;
  });
  await page.getByRole('button', { name: 'Show description' }).click();
  await paused;
  return (turn: number) =>
    page.evaluate((target) => {
      const sheet = document.querySelector<HTMLElement>(
        '[data-lightbox-sheet]',
      )!;
      const [turning] = sheet.getAnimations();
      const at = (time: number) => {
        for (const animation of document.getAnimations())
          animation.currentTime = time;
        return Number(
          getComputedStyle(sheet).getPropertyValue('--lightbox-turn'),
        );
      };
      let [low, high] = [0, Number(turning.effect!.getTiming().duration)];
      // Seeking to the very end would finish, and so remove, the transition.
      const turningOver = at(high / 2) > at(low);
      for (let step = 0; step < 30; step += 1) {
        const middle = (low + high) / 2;
        if (at(middle) < target === turningOver) low = middle;
        else high = middle;
      }
      at(high);
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return {
        card: box('.lightbox-card'),
        front: box('.lightbox-front > img'),
      };
    }, turn);
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
  await expect(current).toHaveText('Cycling Transport Analysis');

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#image-3$/);
  await expect(current).toHaveText('Life at the city');
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

test('separate Hangár galleries share a lightbox across the full-width drawing', async ({
  page,
}) => {
  await page.goto('/projects/galerie-hangár/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const duplicateTriggers = page.locator(
    'button[data-lightbox-index]:has(img[src="/uploads/Scene 16_4.webp"])',
  );
  await expect(duplicateTriggers).toHaveCount(2);
  const cover = duplicateTriggers.first();
  const lastGalleryDrawing = page
    .locator('article > div.mt-12.grid')
    .first()
    .locator('button')
    .last();
  const fullWidthDrawing = page
    .locator('article > button.mt-12[data-lightbox-index]')
    .last();
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
  ).toHaveText(`${fullWidthIndex + 1} / 27`);

  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    '/uploads/Image_2.webp',
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

test('the pyramid requests the closest level that does not need upscaling', async ({
  browserName,
  browser,
}) => {
  test.skip(
    browserName !== 'chromium',
    'One browser verifies the shared DZI requests',
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 667 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
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
  await context.close();
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
      decodeURIComponent(response.url()).includes('GALERIE - Půdorys')
    ) {
      failedSetImages.push(response.url());
    }
  });
  await page.goto('/projects/galerie-hang%C3%A1r/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const groundFloorPreview = galleryImage(page, 5);
  const basementPreview = galleryImage(page, 6);
  const roofPreview = galleryImage(page, 7);
  await expect(groundFloorPreview).toBeVisible();
  await expect(basementPreview).toBeVisible();
  await expect(roofPreview).toBeVisible();

  await groundFloorPreview.click();
  await waitForLightbox(page);
  const comparison = page.getByRole('navigation', {
    name: 'Images in this set',
  });
  await expect(comparison.getByRole('button', { name: 'Ground floor plan' })).toHaveAttribute(
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

  const blend = pausedCardMove(page, 90);
  await comparison.getByRole('button', { name: 'Basement floor plan' }).click();
  const blendState = await (await blend).jsonValue();
  if (!blendState) throw new Error('Expected an active blend');
  expect(blendState.front).toBeGreaterThan(0);
  expect(blendState.front).toBeLessThan(1);
  expect(blendState.stripX).toBe(0);
  expect(
    await page.locator('[aria-label="Images in this set"] button:disabled').count(),
  ).toBe(1);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.play()),
  );
  await expect(page).toHaveURL(/#image-6$/);
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
  await expect(page).toHaveURL(/#image-7$/);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  // After the set comes a different card: it slides in at rest.
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page).toHaveURL(/#image-8$/);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
  await expect(
    page.getByRole('navigation', { name: 'Images in this set' }),
  ).toHaveCount(0);
});

test('the set strip scrolls beside the close control on a narrow screen', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projects/galerie-hang%C3%A1r/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await galleryImage(page, 6).click();
  await waitForLightbox(page);

  const comparison = page.getByRole('navigation', {
    name: 'Images in this set',
  });
  const [closeBox, comparisonBox, buttonBox] = await Promise.all([
    page.getByRole('button', { name: 'Close' }).boundingBox(),
    comparison.boundingBox(),
    comparison.getByRole('button', { name: 'Roof plan' }).boundingBox(),
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

  await context.close();
});

test('mobile touch stays inside the modal and navigation overlays the image edges', async ({
  browserName,
  browser,
}) => {
  test.skip(
    browserName !== 'chromium',
    'One touch-capable browser covers shared input handling',
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
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
  await context.close();
});

test('the description is on the back of the drawing', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  const flip = dialog.getByRole('button', { name: 'Show description' });
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  await flip.click();

  const text = dialog.getByRole('region', { name: 'Life at the city' });
  await expect(text).toBeVisible();
  await expect(
    text.getByRole('heading', { name: 'Life at the city' }),
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
    dialog.getByRole('region', { name: 'Život ve městě' }),
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
  const text = page.getByRole('region', { name: 'Life at the city' });
  await text.hover();
  await page.mouse.wheel(0, 150);
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Show description' }).click();
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
});

test('on a phone the text uses the width and dragging it moves the strip like the drawing', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 6).click(); // the set's last member; next is another card
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  await expect(page.getByRole('button', { name: 'Next image' })).toBeHidden();
  const text = page.getByRole('region', { name: 'Limitations of the Area' });
  const paragraph = (await text.locator('p').boundingBox())!;
  expect(Math.round(paragraph.width)).toBe(390 - 48);

  const slide = page.locator('.lightbox-slide-current');
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 300, y: 420 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 200, y: 422 }],
  });
  expect((await slide.boundingBox())!.x).toBeCloseTo(-100, 0);
  expect((await text.locator('p').boundingBox())!.x).toBeCloseTo(
    paragraph.x - 100,
    0,
  );
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 90, y: 430 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(page).toHaveURL(/#image-7$/);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Next image' })).toBeVisible();
  await context.close();
});

async function phoneOnText(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  const session = await context.newCDPSession(page);
  /**
   * Drags one finger through `points`, returning after each move the strip's
   * offset and the blend towards another image.
   */
  const drag = async (points: { x: number; y: number }[]) => {
    const moves: { strip: number; blend: number }[] = [];
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
  return { context, page, drag };
}

test('scrolling the text on a phone leaves the strip in place', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const { context, page, drag } = await phoneOnText(browser);
  const text = page.getByRole('region', { name: 'Life at the city' });
  const scrollTop = () => text.evaluate((element) => element.scrollTop);

  // Mostly vertical: dx −60, dy −300.
  const diagonal = await drag(
    Array.from({ length: 16 }, (_, step) => ({ x: 300 - step * 4, y: 700 - step * 20 })),
  );
  await expect.poll(scrollTop).toBeGreaterThan(0);
  expect(diagonal).toEqual(diagonal.map(() => ({ strip: 0, blend: 0 })));
  await page.waitForTimeout(500);
  const afterDiagonal = await scrollTop();

  // A scroll that turns sideways afterwards is still a scroll.
  const turning = [
    ...Array.from({ length: 16 }, (_, step) => ({ x: 360, y: 300 + step * 20 })),
    ...Array.from({ length: 9 }, (_, step) => ({ x: 320 - step * 40, y: 600 })),
  ];
  const moves = await drag(turning);
  await expect.poll(scrollTop).toBeLessThan(afterDiagonal);
  expect(moves).toEqual(moves.map(() => ({ strip: 0, blend: 0 })));
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/#image-3$/);
  await context.close();
});

test('a text selection keeps a sideways drag from moving the strip', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const { context, page, drag } = await phoneOnText(browser);
  await page
    .getByRole('region', { name: 'Life at the city' })
    .locator('p')
    .evaluate((paragraph) => getSelection()!.selectAllChildren(paragraph));
  const moves = await drag([
    { x: 300, y: 420 },
    { x: 200, y: 422 },
    { x: 90, y: 430 },
  ]);

  expect(moves).toEqual(moves.map(() => ({ strip: 0, blend: 0 })));
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/#image-3$/);
  await context.close();
});

test('Tab reaches the scrollable description', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  const text = page.getByRole('region', { name: 'Life at the city' });
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
  const turning = () =>
    page
      .locator('[data-lightbox-sheet]')
      .evaluate((sheet) => sheet.getAnimations().length > 0);
  const text = page.getByRole('region', { name: 'Life at the city' });

  await flip.click();
  expect(await turning()).toBe(true);
  expect(
    await text.evaluate((element) =>
      Boolean(element.closest('[data-lightbox-sheet]')),
    ),
  ).toBe(true);
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  await expect(text).toBeVisible();

  await flip.click();
  expect(await turning()).toBe(true);
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(1, 3);
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

  const midSlide = page.waitForFunction(() => {
    const slide = document.querySelector<HTMLElement>('.lightbox-slide-current')!;
    const animation = slide.getAnimations().at(0);
    if (!animation) return false;
    animation.pause();
    animation.currentTime = 90;
    const sheet = slide.querySelector('[data-lightbox-sheet]')!;
    const text = slide.querySelector('[role="region"]');
    return {
      hash: location.hash,
      slideX: slide.getBoundingClientRect().x,
      text: text?.getAttribute('aria-label'),
      textVisible: Boolean(text?.checkVisibility({ visibilityProperty: true })),
      sheetTurn: new DOMMatrix(
        getComputedStyle(sheet.querySelector('.lightbox-front')!).transform,
      ).m11,
      sheetAnimations: sheet.getAnimations().length,
    };
  });
  await page.getByRole('button', { name: 'Next image' }).click();
  const state = await (await midSlide).jsonValue();
  if (!state) throw new Error('Expected a running slide');
  expect(state.hash).toBe('#image-6');
  expect(state.slideX).toBeLessThan(0);
  expect(state.text).toBe('Limitations of the Area');
  expect(state.textVisible).toBe(true);
  expect(state.sheetTurn).toBeCloseTo(-1, 3);
  expect(state.sheetAnimations).toBe(0);

  await expect(page).toHaveURL(/#image-7$/);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  expect(
    await page
      .locator('[data-lightbox-sheet]')
      .evaluate((sheet) => sheet.getAnimations().length),
  ).toBe(0);
  await expect(page.getByRole('region', { name: 'Site Plan' })).toBeHidden();
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

  const midTurn = pausedCardMove(page, 200);
  await page.getByRole('button', { name: 'Next image' }).click();
  const state = await (await midTurn).jsonValue();
  if (!state) throw new Error('Expected a turn and blend');
  expect(state.hash).toBe('#image-3');
  expect(state.stripX).toBe(0);
  expect(state.turn).toBeGreaterThan(0.2);
  expect(state.turn).toBeLessThan(0.8);
  expect(state.front).toBeCloseTo(1 - state.turn, 1);
  expect(state.back).toBeCloseTo(1 - state.turn, 1);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.play()),
  );

  await expect(page).toHaveURL(/#image-4$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  await flip.click();
  await expect(page.getByRole('region', { name: 'Sports facilities' })).toBeVisible();
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

  const midTurn = pausedCardMove(page, 200);
  await page
    .getByRole('navigation', { name: 'Images in this set' })
    .getByRole('button', { name: 'Values of the Area' })
    .click();
  const state = await (await midTurn).jsonValue();
  if (!state) throw new Error('Expected a turn and blend');
  expect(state.hash).toBe('#image-3');
  expect(state.stripX).toBe(0);
  expect(state.turn).toBeGreaterThan(0.2);
  expect(state.turn).toBeLessThan(0.8);
  expect(state.front).toBeCloseTo(1 - state.turn, 1);
  expect(state.back).toBeCloseTo(1 - state.turn, 1);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.play()),
  );

  await expect(page).toHaveURL(/#image-5$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  await flip.click();
  await expect(page.getByRole('region', { name: 'Values of the Area' })).toBeVisible();
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

  const midBlend = pausedCardMove(page, 90);
  await page.getByRole('button', { name: 'Next image' }).click();
  const state = await (await midBlend).jsonValue();
  if (!state) throw new Error('Expected a blend');
  expect(state.front).toBeGreaterThan(0);
  expect(state.front).toBeLessThan(1);
  expect(state.stripX).toBe(0);
  expect(state.turn).toBeCloseTo(0, 3);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.play()),
  );
  await expect(page).toHaveURL(/#image-4$/);
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

  const slide = page.waitForFunction(
    () => document.querySelector('.lightbox-slide-current')!.getAnimations().length > 0,
  );
  await page.getByRole('button', { name: 'Next image' }).click();
  await slide;
  await expect(page).toHaveURL(/#image-7$/);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
});

test('a drag towards a variant scrubs the blend instead of moving the strip', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
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
  await context.close();
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

test('a drag on the text towards a variant turns and blends together', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  const touch = await oneFinger(context, page);
  const card = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('[data-lightbox-sheet]')!;
      const opacity = (face: string) =>
        Number(getComputedStyle(sheet.querySelector(`${face} .lightbox-incoming`)!).opacity);
      return {
        turn: new DOMMatrix(
          getComputedStyle(sheet.querySelector('.lightbox-front')!).transform,
        ).m11,
        front: opacity('.lightbox-front'),
        back: opacity('.lightbox-back'),
      };
    });

  // On the 390 px stage: dx −117 is 0.3 (126°), dx −273 is 0.7 (54°), and
  // half the width (dx −195) is edge-on.
  await touch('touchStart', 300);
  await touch('touchMove', 183);
  await expect.poll(async () => (await card()).front).toBeCloseTo(0.3, 2);
  let state = await card();
  expect(state.turn).toBeCloseTo(Math.cos(Math.PI * 0.7), 2);
  expect(state.back).toBeCloseTo(0.3, 2);
  await touch('touchMove', 105);
  await expect.poll(async () => (await card()).front).toBeCloseTo(0.5, 2);
  expect((await card()).turn).toBeCloseTo(0, 2);
  await touch('touchMove', 27);
  await expect.poll(async () => (await card()).front).toBeCloseTo(0.7, 2);
  state = await card();
  expect(state.turn).toBeCloseTo(Math.cos(Math.PI * 0.3), 2);
  expect(state.back).toBeCloseTo(0.7, 2);
  await touch('touchMove', 270);
  await expect.poll(async () => (await card()).front).toBeCloseTo(30 / 390, 2);
  await touch('touchEnd');
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(page).toHaveURL(/#image-3$/);
  await expect(page.getByRole('region', { name: 'Life at the city' })).toBeVisible();
  await context.close();
});

test('a drag on the text past the threshold completes on the variant drawing', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  const touch = await oneFinger(context, page);

  await touch('touchStart', 300);
  await touch('touchMove', 183);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const layer = document.querySelector('.lightbox-incoming');
        return layer ? Number(getComputedStyle(layer).opacity) : 0;
      }),
    )
    .toBeCloseTo(0.3, 2);
  await touch('touchEnd');
  await expect(page).toHaveURL(/#image-4$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  await flip.click();
  await expect(page.getByRole('region', { name: 'Sports facilities' })).toBeVisible();
  await context.close();
});

test('a scrub towards a loading variant neither darkens the drawing nor completes early', async ({
  page,
}) => {
  // Below 100% the variant needs a smaller file than its neighbour preview.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/projects/galerie-hang%C3%A1r/#image-5');
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
  await expect(page).toHaveURL(/#image-6$/);
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
      () => document.querySelector('.lightbox-incoming img')?.getAttribute('src') ?? '',
    );

  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(680, 400);
  await expect.poll(incoming).not.toBe('');
  const towardsNext = await incoming();
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(900, 400);
  expect(await incoming()).toBe(towardsNext);
  await page.mouse.up();
  await expect(page).toHaveURL(/#image-4$/);
  await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
});

for (const input of ['mouse', 'touch'] as const) {
  test(`a change of image ends the ${input} drag in progress`, async ({
    browser,
    browserName,
  }) => {
    test.skip(
      input === 'touch' && browserName !== 'chromium',
      'One touch-capable browser covers this',
    );
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ...(input === 'touch' ? { hasTouch: true, isMobile: true } : {}),
    });
    const page = await context.newPage();
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
    await page.waitForTimeout(500);
    await move(360);
    await lift();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/#image-3$/);
    expect(await stripX()).toBe(0);
    await expect(page.locator('.lightbox-incoming')).toHaveCount(0);
    // The strip's ease-back has ended: a new drag follows the finger directly.
    await expect(page.locator('.lightbox-slide-current')).toHaveCSS(
      'transition-duration',
      '0s',
    );
    await context.close();
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
    await withDescription(
      page,
      projectPath,
      '/uploads/03 SWOT - život v Kyjově.png',
      'A short note.',
    );
    await gotoProject(page, '#image-3');
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
    const wide = '/uploads/Image25_000.webp'; // 2560 × 1440
    await withDescription(page, projectPath, wide, LONG_TEXT);
    await gotoProject(page, '#image-11');
    await waitForLightbox(page);
    await page.getByRole('button', { name: 'Show description' }).click();
    await settled(page);
    const scroller = page.getByRole('region', { name: 'Visualization' });
    const band = await page
      .getByRole('button', { name: 'Close' })
      .evaluate(
        (close) =>
          2 * close.getBoundingClientRect().y +
          close.getBoundingClientRect().height,
      );

    let { card, article } = await boxes(page);
    expect(card.width / card.height).toBeCloseTo(2560 / 1440, 2);
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
  const flip = page.getByRole('button', { name: 'Show description' });

  const midFlip = page.waitForFunction(() => {
    const sheet = document.querySelector('[data-lightbox-sheet]')!;
    const animations = sheet.getAnimations();
    if (!animations.length) return false;
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 280;
    }
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
  await flip.click();
  const middle = await (await midFlip).jsonValue();
  if (!middle) throw new Error('Expected a running flip');
  expect(middle.scale).toBeLessThan(zoomed.scale);
  expect(middle.scale).toBeGreaterThan(1);
  expect(Math.abs(middle.x)).toBeLessThan(Math.abs(zoomed.x));
  expect(middle.originX).toBeCloseTo(middle.sheetWidth / 2, 0);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.play()),
  );
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

  const midTurn = pausedCardMove(page, 280);
  await page.getByRole('button', { name: 'Next image' }).click();
  expect(await (await midTurn).jsonValue()).toBeTruthy();
  const middle = await drawingView(page);
  expect(middle.scale).toBeGreaterThan(1);
  expect(middle.scale).toBeLessThan(zoomed.scale);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.play()),
  );

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
  await withDescription(
    page,
    projectPath,
    '/uploads/03 SWOT - život v Kyjově.png',
    LONG_TEXT,
  );
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();
  await settled(page);
  const text = page.getByRole('region', { name: 'Life at the city' });
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

test('both faces keep one outline throughout a turn from a zoomed corner', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page, '#image-3');
  await waitForLightbox(page);
  const rest = (await page.locator('.lightbox-front > img').boundingBox())!;
  await page.mouse.move(rest.x + 30, rest.y + 30);
  await page.mouse.wheel(0, -1200);
  await expect
    .poll(async () => (await drawingView(page)).scale)
    .toBeGreaterThan(2);

  const frameAt = await pausedFlip(page);
  const dark = async (x: number, y: number) => {
    if (x < 60 || x > 1380) return true; // under the edge arrows or off the screen
    return Math.max(...(await pixelAt(page, x, y))) < 80;
  };

  for (const turn of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
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
  }

  // While the drawing faces the viewer, the card is not drawn at all.
  await frameAt(0.25);
  const front = page.locator('.lightbox-front');
  await front.evaluate((face: HTMLElement) => (face.style.display = 'none'));
  await page.waitForTimeout(100);
  for (const [x, y] of [
    [400, 300],
    [720, 450],
    [1000, 600],
  ]) {
    expect(await dark(x, y)).toBe(true);
  }
  await front.evaluate((face: HTMLElement) => (face.style.display = ''));

  // While the back faces the viewer, the drawing is not drawn at all.
  await frameAt(0.75);
  await page
    .locator('.lightbox-back')
    .evaluate((back: HTMLElement) => (back.style.display = 'none'));
  await page.waitForTimeout(100);
  for (const [x, y] of [
    [400, 300],
    [720, 450],
    [1000, 600],
  ]) {
    expect(await dark(x, y)).toBe(true);
  }
});

for (const [name, file, hash] of [
  ['a wide drawing', '/uploads/Image25_000.webp', '#image-11'],
  ['a square drawing', '/uploads/03 SWOT - život v Kyjově.png', '#image-3'],
] as const) {
  test(`mid-turn a card larger than the screen keeps its full outline (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await withDescription(page, projectPath, file, LONG_TEXT);
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
      const middle = (top + bottom) / 2;
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
    await withDescription(page, projectPath, '/uploads/Image25_000.webp', LONG_TEXT);
    await gotoProject(page, '#image-11');
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
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
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
  await withDescription(
    page,
    projectPath,
    '/uploads/03 SWOT - život v Kyjově.png',
    'A short note.',
    { responsive: false },
  );
  await gotoProject(page, '#image-3');
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
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
  await settled(page);
  await expect(page.getByRole('region', { name: 'Life at the city' })).toBeVisible();
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
  await withDescription(
    page,
    projectPath,
    '/uploads/03 SWOT - život v Kyjově.png',
    LONG_TEXT,
  );
  await gotoProject(page, '#image-3');
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
  const midTurn = pausedCardMove(page, 200);
  await page.getByRole('button', { name: 'Next image' }).click();
  expect(await (await midTurn).jsonValue()).toBeTruthy();
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
  await gotoProject(page, '#image-3');
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
  await withDescription(
    page,
    projectPath,
    '/uploads/03 SWOT - život v Kyjově.png',
    LONG_TEXT,
  );
  await gotoProject(page, '#image-3');
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
  const text = page.getByRole('region', { name: 'Life at the city' });
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

test('with reduced motion a change to a variant is instant', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const changed = () =>
    page.evaluate(() => ({
      hash: location.hash,
      blending: Boolean(document.querySelector('.lightbox-incoming')),
      animating: document.getAnimations().length > 0,
    }));

  const touch = await oneFinger(context, page);
  await touch('touchStart', 300);
  await touch('touchMove', 200);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await changed()).toEqual({ hash: '#image-3', blending: false, animating: false });
  expect((await page.locator('.lightbox-slide-current').boundingBox())!.x).toBe(0);
  await touch('touchEnd');
  await expect(page).toHaveURL(/#image-4$/);
  expect(await changed()).toEqual({ hash: '#image-4', blending: false, animating: false });

  // A variant keeps the inspected view.
  await page.keyboard.press('+');
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1.25, 2);
  await page
    .getByRole('button', { name: 'Next image' })
    .evaluate((button: HTMLButtonElement) => button.click());
  expect(await changed()).toEqual({ hash: '#image-5', blending: false, animating: false });
  expect(await imageZoom(page)).toBeCloseTo(1.25, 2);
  await context.close();
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
    .getByRole('region', { name: 'Life at the city' })
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
    .getByRole('region', { name: 'Life at the city' })
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

test('double-tap zooms on touch screens', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'One touch-capable browser covers this');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  await page.touchscreen.tap(195, 420);
  await page.touchscreen.tap(195, 420);
  await expect.poll(() => imageZoom(page)).toBeCloseTo(2.5, 2);
  await expect(page).toHaveURL(/#image-3$/);

  await page.touchscreen.tap(195, 420);
  await page.touchscreen.tap(195, 420);
  await expect.poll(() => imageZoom(page)).toBeCloseTo(1, 2);
  await context.close();
});

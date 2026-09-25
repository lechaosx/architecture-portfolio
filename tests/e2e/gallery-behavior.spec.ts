import { expect, test, type Browser, type Page } from '@playwright/test';

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
  await expect(page.getByRole('dialog', { name })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.matches(':active-view-transition'),
      ),
    )
    .toBe(false);
}

/** Rendered width of the current lightbox image relative to its rest (100%) width. */
async function imageZoom(page: Page) {
  return page
    .locator('.lightbox-slide-current img')
    .evaluate(
      (image: HTMLImageElement) =>
        image.getBoundingClientRect().width / image.offsetWidth,
    );
}

/** Horizontal scale of the current card's turn: 1 drawing side up, −1 text side up. */
async function sheetTurn(page: Page) {
  return page
    .locator('[data-lightbox-sheet]')
    .evaluate((sheet) => new DOMMatrix(getComputedStyle(sheet).transform).m11);
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
    stageBox.x + stageBox.width / 2 - 100,
    stageBox.y + stageBox.height / 2,
  );
  const draggedSlide = (await slides[1].boundingBox())!;
  expect(draggedSlide.x - current!.x).toBeCloseTo(-100, 0);
  await page.mouse.move(
    stageBox.x + stageBox.width / 2 - 20,
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
  const transformBeforePan = await currentImage.getAttribute('style');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40);
  await page.mouse.up();
  expect(await currentImage.getAttribute('style')).not.toBe(transformBeforePan);

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
    .locator('.lightbox-slide-current img')
    .evaluate((image: HTMLImageElement) => image.style.transform);

  const blendPromise = page.waitForFunction(() => {
    const current = document.querySelector<HTMLElement>(
      '.lightbox-comparison-current',
    );
    const previous = document.querySelector<HTMLElement>(
      '.lightbox-comparison-previous',
    );
    const animation = current?.getAnimations()[0];
    if (!current || !previous || !animation) return false;
    animation.pause();
    animation.currentTime = 90;
    return {
      currentOpacity: Number(getComputedStyle(current).opacity),
      previousOpacity: Number(getComputedStyle(previous).opacity),
      selectedButtons: document.querySelectorAll(
        '[aria-label="Images in this set"] button:disabled',
      ).length,
    };
  });
  await comparison.getByRole('button', { name: 'Basement floor plan' }).click();
  const blend = await blendPromise;
  await expect(page).toHaveURL(/#image-6$/);
  const blendState = await blend.jsonValue();
  if (!blendState) throw new Error('Expected an active comparison blend');
  expect(blendState.currentOpacity).toBeGreaterThan(0);
  expect(blendState.currentOpacity).toBeLessThan(1);
  expect(blendState.previousOpacity).toBe(1);
  expect(blendState.selectedButtons).toBe(1);
  expect(await imageZoom(page)).toBeCloseTo(zoom, 3);
  await expect
    .poll(() =>
      page
        .locator('.lightbox-slide-current img')
        .evaluate((image: HTMLImageElement) => image.style.transform),
    )
    .toBe(transform);
  expect(failedSetImages).toEqual([]);
  await expect(page.locator('.lightbox-comparison-previous')).toHaveCount(0);

  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page).toHaveURL(/#image-7$/);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
  await page.getByRole('button', { name: 'Next image' }).click();
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
    text.boundingBox(),
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
  const mask = () => text.evaluate((element) => getComputedStyle(element).maskImage);
  const maskAtTop = await mask();
  await text.hover();
  await page.mouse.wheel(0, 150);
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(mask).not.toBe(maskAtTop);

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
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  await expect(page.getByRole('button', { name: 'Next image' })).toBeHidden();
  const text = page.getByRole('region', { name: 'Life at the city' });
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
  await expect(page).toHaveURL(/#image-4$/);
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
  /** Drags one finger through `points`, returning the strip offset after each move. */
  const drag = async (points: { x: number; y: number }[]) => {
    const offsets: number[] = [];
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [points[0]],
    });
    for (const point of points.slice(1)) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point],
      });
      offsets.push(
        (await page.locator('.lightbox-slide-current').boundingBox())!.x,
      );
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    return offsets;
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
  expect(diagonal.every((offset) => Math.abs(offset) < 1)).toBe(true);
  await page.waitForTimeout(500);
  const afterDiagonal = await scrollTop();

  // A scroll that turns sideways afterwards is still a scroll.
  const turning = [
    ...Array.from({ length: 16 }, (_, step) => ({ x: 360, y: 300 + step * 20 })),
    ...Array.from({ length: 9 }, (_, step) => ({ x: 320 - step * 40, y: 600 })),
  ];
  const offsets = await drag(turning);
  await expect.poll(scrollTop).toBeLessThan(afterDiagonal);
  expect(offsets.every((offset) => Math.abs(offset) < 1)).toBe(true);
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
  const offsets = await drag([
    { x: 300, y: 420 },
    { x: 200, y: 422 },
    { x: 90, y: 430 },
  ]);

  expect(offsets.every((offset) => Math.abs(offset) < 1)).toBe(true);
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
  const transform = await page
    .getByRole('region', { name: 'Life at the city' })
    .evaluate(
      (element) =>
        getComputedStyle(element.closest('[data-lightbox-sheet]')!).transform,
    );
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
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
  await galleryImage(page, 3).click();
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
      sheetTurn: new DOMMatrix(getComputedStyle(sheet).transform).m11,
      sheetAnimations: sheet.getAnimations().length,
    };
  });
  await page.getByRole('button', { name: 'Next image' }).click();
  const state = await (await midSlide).jsonValue();
  if (!state) throw new Error('Expected a running slide');
  expect(state.hash).toBe('#image-3');
  expect(state.slideX).toBeLessThan(0);
  expect(state.text).toBe('Life at the city');
  expect(state.textVisible).toBe(true);
  expect(state.sheetTurn).toBeCloseTo(-1, 3);
  expect(state.sheetAnimations).toBe(0);

  await expect(page).toHaveURL(/#image-4$/);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
  expect(await sheetTurn(page)).toBeCloseTo(1, 3);
  expect(
    await page
      .locator('[data-lightbox-sheet]')
      .evaluate((sheet) => sheet.getAnimations().length),
  ).toBe(0);
  await expect(
    page.getByRole('region', { name: 'Sports facilities' }),
  ).toBeHidden();
});

test('a set button from the description crossfades from the text to the new drawing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoProject(page);
  await galleryImage(page, 3).click();
  await waitForLightbox(page);
  const flip = page.getByRole('button', { name: 'Show description' });
  await flip.click();
  await expect.poll(() => sheetTurn(page)).toBeCloseTo(-1, 3);
  const text = page.getByRole('region', { name: 'Life at the city' });
  await text.hover();
  await page.mouse.wheel(0, 150);
  await expect.poll(() => text.evaluate((element) => element.scrollTop)).toBeGreaterThan(50);
  const scrolled = await text.evaluate((element) => element.scrollTop);

  const blend = page.waitForFunction(() => {
    const current = document.querySelector<HTMLElement>(
      '.lightbox-comparison-current',
    );
    const previous = document.querySelector<HTMLElement>(
      '.lightbox-comparison-previous',
    );
    const animation = current?.getAnimations()[0];
    if (!current || !previous || !animation) return false;
    animation.pause();
    animation.currentTime = 90;
    const sheet = current.querySelector('[data-lightbox-sheet]')!;
    return {
      currentOpacity: Number(getComputedStyle(current).opacity),
      previousText: previous.querySelector('p')?.textContent ?? '',
      previousScroll: previous.querySelector('[role="region"]')?.scrollTop ?? 0,
      currentTurn: new DOMMatrix(getComputedStyle(sheet).transform).m11,
    };
  });
  await page
    .getByRole('navigation', { name: 'Images in this set' })
    .getByRole('button', { name: 'Values of the Area' })
    .click();
  const state = await (await blend).jsonValue();
  if (!state) throw new Error('Expected an active comparison blend');
  expect(state.currentOpacity).toBeGreaterThan(0);
  expect(state.currentOpacity).toBeLessThan(1);
  expect(state.previousText).toContain('The analysis of life in Kyjov');
  expect(state.previousScroll).toBeCloseTo(scrolled, 0);
  expect(state.currentTurn).toBeCloseTo(1, 3);

  await expect(page).toHaveURL(/#image-5$/);
  await expect(page.locator('.lightbox-comparison-previous')).toHaveCount(0);
  await expect(flip).toHaveAttribute('aria-pressed', 'false');
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

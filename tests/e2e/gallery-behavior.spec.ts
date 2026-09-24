import { expect, test, type Page } from '@playwright/test';

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
  const firstCaption = await page
    .locator('.lightbox-caption-current')
    .innerText();
  expect(firstCaption.trim()).not.toBe('');

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#image-3$/);
  await expect
    .poll(() => page.locator('.lightbox-caption-current').innerText())
    .not.toBe(firstCaption);
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

  const preview = page.locator('.lightbox-slide-current > img');
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

  const currentCaption = (await page
    .locator('.lightbox-caption-current')
    .boundingBox())!;
  const nextCaption = (await page
    .locator('.lightbox-caption-next')
    .boundingBox())!;
  expect(currentCaption.x + currentCaption.width).toBeCloseTo(nextCaption.x, 0);

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
  const draggedCaption = (await page
    .locator('.lightbox-caption-current')
    .boundingBox())!;
  expect(draggedSlide.x - current!.x).toBeCloseTo(-100, 0);
  expect(draggedCaption.x - currentCaption.x).toBeCloseTo(-100, 0);
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

  const image = page.locator('.lightbox-slide-current > img');
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
  const reset = page.getByRole('button', { name: 'Reset zoom' });
  await expect(reset).not.toHaveText('100%');
  const currentImage = page.locator('.lightbox-slide-current img');
  const transformBeforePan = await currentImage.getAttribute('style');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40);
  await page.mouse.up();
  expect(await currentImage.getAttribute('style')).not.toBe(transformBeforePan);

  await reset.click();
  await expect(reset).toHaveText('100%');
  await expect(currentImage).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
});

test('desktop navigation overlays the full-width stage and stays clickable while zoomed', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  const stage = page.locator('.lightbox-stage');
  const previous = page.getByRole('button', { name: 'Previous image' });
  const next = page.getByRole('button', { name: 'Next image' });
  const [stageBox, captionBox, previousBox, nextBox] = await Promise.all([
    stage.boundingBox(),
    page.locator('.lightbox-caption').boundingBox(),
    previous.boundingBox(),
    next.boundingBox(),
  ]);
  expect(stageBox!.x).toBeCloseTo(captionBox!.x, 0);
  expect(stageBox!.width).toBeCloseTo(captionBox!.width, 0);
  expect(previousBox!.x).toBeGreaterThanOrEqual(stageBox!.x);
  expect(previousBox!.x - stageBox!.x).toBeLessThan(stageBox!.width / 4);
  expect(nextBox!.x + nextBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(stageBox!.x + stageBox!.width - nextBox!.x).toBeLessThan(
    stageBox!.width / 4,
  );

  await stage.hover();
  await page.mouse.wheel(0, -1200);
  await expect(page.getByRole('button', { name: 'Reset zoom' })).not.toHaveText(
    '100%',
  );

  await next.click();
  await expect(page).toHaveURL(/#image-11$/);
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText(
    '100%',
  );
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
    name: 'Compare drawings',
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
  const zoom = await page.getByRole('button', { name: 'Reset zoom' }).innerText();
  const transform = await page
    .locator('.lightbox-slide-current > img')
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
        '[aria-label="Compare drawings"] button:disabled',
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
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText(zoom);
  await expect
    .poll(() =>
      page
        .locator('.lightbox-slide-current > img')
        .evaluate((image: HTMLImageElement) => image.style.transform),
    )
    .toBe(transform);
  expect(failedSetImages).toEqual([]);
  await expect(page.locator('.lightbox-comparison-previous')).toHaveCount(0);

  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText(
    '100%',
  );
  await expect(page).toHaveURL(/#image-7$/);
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page.getByRole('navigation', { name: 'Compare drawings' })).toHaveCount(0);
});

test('comparison shortcuts remain usable when the toolbar is narrow', async ({
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

  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  const comparison = page.getByRole('navigation', {
    name: 'Compare drawings',
  });
  const selected = comparison.getByRole('button', { name: 'Roof plan' });
  const [
    dialogBox,
    closeBox,
    comparisonBox,
    selectedBox,
    originalBox,
    positionBox,
    stageBox,
    zoomOutBox,
    resetBox,
    zoomInBox,
  ] = await Promise.all([
    dialog.boundingBox(),
    page.getByRole('button', { name: 'Close' }).boundingBox(),
    comparison.boundingBox(),
    selected.boundingBox(),
    page.getByRole('link', { name: 'Open original' }).boundingBox(),
    dialog.getByRole('status').boundingBox(),
    page.locator('.lightbox-stage').boundingBox(),
    page.getByRole('button', { name: 'Zoom out' }).boundingBox(),
    page.getByRole('button', { name: 'Reset zoom' }).boundingBox(),
    page.getByRole('button', { name: 'Zoom in' }).boundingBox(),
  ]);
  expect(comparisonBox!.y).toBeCloseTo(closeBox!.y, 0);
  expect(selectedBox!.y).toBeCloseTo(closeBox!.y, 0);
  expect(selectedBox!.height).toBe(closeBox!.height);
  expect(comparisonBox!.x).toBeCloseTo(dialogBox!.x + 16, 0);
  expect(comparisonBox!.x + comparisonBox!.width).toBeLessThanOrEqual(
    closeBox!.x,
  );
  expect(zoomOutBox!.y).toBeCloseTo(resetBox!.y, 0);
  expect(zoomInBox!.y).toBeCloseTo(resetBox!.y, 0);
  expect(zoomOutBox!.height).toBe(closeBox!.height);
  expect(resetBox!.height).toBe(closeBox!.height);
  expect(zoomInBox!.height).toBe(closeBox!.height);
  expect(zoomInBox!.x + zoomInBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(
    stageBox!.x + stageBox!.width - zoomInBox!.x - zoomInBox!.width,
  ).toBeLessThanOrEqual(16);
  expect(originalBox!.y + originalBox!.height / 2).toBeCloseTo(
    positionBox!.y + positionBox!.height / 2,
    0,
  );
  expect(originalBox!.x + originalBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(originalBox!.height).toBe(closeBox!.height);
  expect(positionBox!.height).toBe(closeBox!.height);
  expect(positionBox!.x + positionBox!.width).toBeLessThanOrEqual(
    stageBox!.x + stageBox!.width,
  );
  expect(
    stageBox!.x + stageBox!.width - originalBox!.x - originalBox!.width,
  ).toBeLessThanOrEqual(16);
  expect(positionBox!.y + positionBox!.height).toBeLessThanOrEqual(
    stageBox!.y + stageBox!.height,
  );
  expect(
    stageBox!.y + stageBox!.height - positionBox!.y - positionBox!.height,
  ).toBeLessThanOrEqual(16);

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

test('viewport zoom controls step and reset without moving with the image', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 11).click();
  await waitForLightbox(page);

  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  const reset = page.getByRole('button', { name: 'Reset zoom' });
  const position = page.getByRole('status');
  const [zoomInBox, positionBox] = await Promise.all([
    zoomIn.boundingBox(),
    position.boundingBox(),
  ]);

  await expect(zoomOut).toBeDisabled();
  await expect(zoomIn).toBeEnabled();
  await zoomIn.click();
  await expect(reset).not.toHaveText('100%');
  expect(await zoomIn.boundingBox()).toEqual(zoomInBox);
  expect(await position.boundingBox()).toEqual(positionBox);
  await zoomOut.click();
  await expect(reset).toHaveText('100%');
  await zoomIn.click();
  await reset.click();
  await expect(reset).toHaveText('100%');
});

test('caption text follows the language but never handles navigation gestures', async ({
  page,
}) => {
  await gotoProject(page, '?lang=cs');
  await galleryImage(page, 2, 'Otevřít obrázek').click();
  await waitForLightbox(page, 'Prohlížeč obrázků');
  const caption = page.locator('.lightbox-caption-current');
  await expect(caption.locator('[lang="cs"]').first()).toBeVisible();
  expect(
    (await caption.locator('[lang="cs"]').first().textContent())?.trim(),
  ).not.toBe('');
  await expect(caption.locator('[lang="en"]').first()).toBeHidden();
  const bounds = (await caption.boundingBox())!;

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - 150, bounds.y + 20);
  await page.mouse.up();
  await expect(page).toHaveURL(/#image-2$/);
});

test('mobile touch stays inside the modal and navigation overlays the image stage', async ({
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

  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  const stage = page.locator('.lightbox-stage');
  const toolbar = dialog.locator(':scope > div').first();
  const previous = page.getByRole('button', { name: 'Previous image' });
  const stageBox = (await stage.boundingBox())!;
  const toolbarBox = (await toolbar.boundingBox())!;
  const previousBox = (await previous.boundingBox())!;
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(stageBox.y);
  expect(previousBox.y).toBeGreaterThanOrEqual(stageBox.y);
  expect(previousBox.y + previousBox.height).toBeLessThanOrEqual(
    stageBox.y + stageBox.height,
  );
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
  await expect(page.getByRole('button', { name: 'Reset zoom' })).not.toHaveText(
    '100%',
  );
  await context.close();
});

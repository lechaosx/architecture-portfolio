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
  await galleryImage(page, 1).click();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-1$/);
  const firstCaption = await page
    .locator('.lightbox-caption-current')
    .innerText();
  expect(firstCaption.trim()).not.toBe('');

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#image-2$/);
  await expect
    .poll(() => page.locator('.lightbox-caption-current').innerText())
    .not.toBe(firstCaption);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#image-1$/);
  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(page).toHaveURL(/#image-2$/);

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));

  await page.goForward();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-2$/);
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

test('the original remains an explicit download while the lightbox uses processed imagery', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 1);
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
  await galleryImage(page, 1).click();
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
  await expect(page).toHaveURL(/#image-1$/);
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
  await galleryImage(page, 1).click();
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

test('desktop navigation stays outside zoomed imagery and remains clickable', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  const stage = page.locator('.lightbox-stage');
  const previous = page.getByRole('button', { name: 'Previous image' });
  const next = page.getByRole('button', { name: 'Next image' });
  const [stageBox, previousBox, nextBox] = await Promise.all([
    stage.boundingBox(),
    previous.boundingBox(),
    next.boundingBox(),
  ]);
  expect(previousBox!.x + previousBox!.width).toBeLessThanOrEqual(stageBox!.x);
  expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(nextBox!.x);

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

test('caption text follows the language but never handles navigation gestures', async ({
  page,
}) => {
  await gotoProject(page, '?lang=cs');
  await galleryImage(page, 1, 'Otevřít obrázek').click();
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
  await expect(page).toHaveURL(/#image-1$/);
});

test('mobile touch stays inside the modal and keeps controls outside the image stage', async ({
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
  expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(previousBox.y);
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

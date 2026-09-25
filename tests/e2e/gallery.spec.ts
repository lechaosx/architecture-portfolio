import { expect, test, type Locator, type Page } from '@playwright/test';

const projectPath = '/projects/urban-study-kyjov/';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

function galleryImage(page: Page, position: number) {
  return page.getByRole('button', {
    name: `Open image ${position}`,
    exact: true,
  });
}

async function gotoProject(page: Page) {
  await page.goto(projectPath);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

async function waitForLightbox(page: Page) {
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();
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

/** Whether the deep-zoom canvas has drawn anything at a viewport point. */
async function tilesDrawnAt(page: Page, point: { x: number; y: number }) {
  return page
    .locator('.openseadragon-canvas canvas')
    .evaluate((canvas: HTMLCanvasElement, { x, y }) => {
      const bounds = canvas.getBoundingClientRect();
      const scale = canvas.width / bounds.width;
      const pixel = canvas
        .getContext('2d')!
        .getImageData(
          Math.floor((x - bounds.x) * scale),
          Math.floor((y - bounds.y) * scale),
          1,
          1,
        ).data;
      return pixel[3] > 0;
    }, point);
}

async function sampleBoxes(locator: Locator, frames = 8) {
  return locator.evaluate(
    async (element, frameCount) => {
      const boxes = [];
      for (let frame = 0; frame < frameCount; frame += 1) {
        const rect = element.getBoundingClientRect();
        boxes.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
        await new Promise(requestAnimationFrame);
      }
      return boxes;
    },
    frames,
  );
}

async function expectLightboxTransition(page: Page, type: string) {
  await expect
    .poll(() =>
      page.evaluate((transitionType) =>
        document.documentElement.matches(
          `:active-view-transition-type(${transitionType})`,
        ),
      type),
    )
    .toBe(true);
}

async function lightboxTransitionState(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .some(
        ({ effect }) =>
          (effect as KeyframeEffect | null)?.pseudoElement ===
          '::view-transition-group(lightbox-image)',
      ),
  );
  return page.evaluate(() => {
    const animations = document.getAnimations();
    const animation = animations.find(
      ({ effect }) =>
        (effect as KeyframeEffect | null)?.pseudoElement ===
        '::view-transition-group(lightbox-image)',
    )!;
    const keyframes = (animation.effect as KeyframeEffect).getKeyframes();
    const start = keyframes.at(0)!;
    const end = keyframes.at(-1)!;
    const imageScaleKeyframes = animations
      .filter(
        ({ effect }) =>
          (effect as KeyframeEffect | null)?.pseudoElement ===
          '::view-transition-new(lightbox-image)',
      )
      .map(({ effect }) => (effect as KeyframeEffect).getKeyframes())
      .find((frames) => frames.some((frame) => frame.scale !== undefined));
    const oldImage = getComputedStyle(
      document.documentElement,
      '::view-transition-old(lightbox-image)',
    );
    const newImage = getComputedStyle(
      document.documentElement,
      '::view-transition-new(lightbox-image)',
    );
    return {
      pairOverflow: getComputedStyle(
        document.documentElement,
        '::view-transition-image-pair(lightbox-image)',
      ).overflow,
      oldImageVisible: oldImage.display !== 'none',
      oldImageAnimated: oldImage.animationName !== 'none',
      oldImageOpacity: Number(oldImage.opacity),
      oldImageBlendMode: oldImage.mixBlendMode,
      newImageVisible: newImage.display !== 'none',
      newImageOpacity: Number(newImage.opacity),
      newImageBlendMode: newImage.mixBlendMode,
      newImageStartScale: imageScaleKeyframes
        ? Number(imageScaleKeyframes.at(0)?.scale)
        : undefined,
      newImageEndScale: imageScaleKeyframes
        ? Number(imageScaleKeyframes.at(-1)?.scale)
        : undefined,
      startScale: new DOMMatrix(String(start.transform)).a,
      endScale: new DOMMatrix(String(end.transform)).a,
    };
  });
}

async function renderedThumbnailScale(thumbnail: Locator) {
  return thumbnail.evaluate((button) => {
    const image = button.querySelector('img')!;
    return image.getBoundingClientRect().width / button.clientWidth;
  });
}

test('native lightbox transitions compose with settled and active thumbnail hover', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  const stableGeometry = {
    pairOverflow: 'clip',
    startScale: 1,
    endScale: 1,
  };

  await thumbnail.hover();
  await page.waitForTimeout(100);
  await thumbnail.locator('img').evaluate(async (image) => {
    await Promise.all(
      image.getAnimations().map(async (animation) => {
        animation.pause();
        await animation.ready;
      }),
    );
  });
  const activeHoverScale = await renderedThumbnailScale(thumbnail);
  await thumbnail.click();
  await expectLightboxTransition(page, 'lightbox-open');
  const activeHoverOpening = await lightboxTransitionState(page);
  expect(activeHoverOpening).toMatchObject({
    ...stableGeometry,
    oldImageVisible: false,
    newImageVisible: true,
    newImageOpacity: 1,
    newImageBlendMode: 'normal',
  });
  expect(activeHoverOpening.newImageStartScale).toBeCloseTo(
    activeHoverScale,
    3,
  );
  expect(activeHoverOpening.newImageEndScale).toBe(1);
  const opening = await sampleBoxes(page.locator('.lightbox-slide-current img'));
  expect(new Set(opening.map((box) => JSON.stringify(box))).size).toBe(1);
  await waitForLightbox(page);

  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');
  expect(await lightboxTransitionState(page)).toMatchObject({
    ...stableGeometry,
    oldImageVisible: true,
    oldImageAnimated: false,
    oldImageOpacity: 1,
    oldImageBlendMode: 'normal',
    newImageVisible: false,
  });
  const closing = await sampleBoxes(thumbnail);
  expect(new Set(closing.map((box) => JSON.stringify(box))).size).toBe(1);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);

  await page.mouse.move(0, 0);
  await page.waitForTimeout(550);
  await thumbnail.hover();
  await page.waitForTimeout(550);
  const settledHoverScale = await renderedThumbnailScale(thumbnail);
  await thumbnail.click();
  await expectLightboxTransition(page, 'lightbox-open');
  const settledHoverOpening = await lightboxTransitionState(page);
  expect(settledHoverOpening).toMatchObject({
    ...stableGeometry,
    oldImageVisible: false,
    newImageVisible: true,
    newImageOpacity: 1,
    newImageBlendMode: 'normal',
  });
  expect(settledHoverOpening.newImageStartScale).toBeCloseTo(
    settledHoverScale,
    3,
  );
  expect(settledHoverOpening.newImageEndScale).toBe(1);
  await waitForLightbox(page);
});

test('shared transitions prevent wheel input from moving the page or image', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);

  await thumbnail.evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('.lightbox-stage').waitFor({ state: 'visible' });
  await page.mouse.move(640, 450);
  await page.mouse.wheel(0, -1200);
  await expectLightboxTransition(page, 'lightbox-open');
  const windowWheelPrevented = await page.evaluate(() => {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 1200,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(windowWheelPrevented).toBe(true);
  expect(await imageZoom(page)).toBeCloseTo(1, 2);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await waitForLightbox(page);

  const closingScrollY = await page.evaluate(() => window.scrollY);
  const closingTarget = await thumbnail.boundingBox();
  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');
  await page.mouse.wheel(0, 1200);
  const closingWheelPrevented = await page.evaluate(() => {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 1200,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(closingWheelPrevented).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(closingScrollY);
  expect(await thumbnail.boundingBox()).toEqual(closingTarget);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
});

test('closing a zoomed image uses the overlay transition without an image morph', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);

  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -1200);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');
  await page.waitForTimeout(50);
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .some(({ effect }) =>
          (effect as KeyframeEffect | null)?.pseudoElement?.includes(
            'lightbox-image',
          ),
        ),
    ),
  ).toBe(false);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
});

test('closing while the description shows uses the overlay transition and reopens on the drawing', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 3);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Show description' }).click();

  await page.keyboard.press('Escape');
  await expectLightboxTransition(page, 'lightbox-close');
  await page.waitForTimeout(50);
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .some(({ effect }) =>
          (effect as KeyframeEffect | null)?.pseudoElement?.includes(
            'lightbox-image',
          ),
        ),
    ),
  ).toBe(false);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(thumbnail).toBeFocused();

  await thumbnail.click();
  await waitForLightbox(page);
  await expect(
    page.getByRole('button', { name: 'Show description' }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('a zoomed image stays clipped to its slide during navigation', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -1200);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  await page
    .getByRole('button', { name: 'Next image' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForFunction(() => {
    const slide = document.querySelector('.lightbox-slide-current');
    const animation = slide?.getAnimations().at(0);
    if (!animation) return false;
    animation.pause();
    animation.currentTime = 90;
    return true;
  });

  const bleedsPastSlide = await page.locator('.lightbox-slide-current').evaluate(
    (slide) => {
      const image = slide.querySelector('img')!;
      const slideRect = slide.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, slideRect.right + 10);
      const y = Math.max(
        0,
        Math.min(innerHeight - 1, (imageRect.top + imageRect.bottom) / 2),
      );
      return (
        imageRect.right > x && document.elementsFromPoint(x, y).includes(image)
      );
    },
  );

  expect(bleedsPastSlide).toBe(false);
});

test('lightbox traps focus, closes with Escape, and restores its trigger', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);

  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
});

test('clicking the lightbox backdrop keeps it open', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  await page.mouse.click(4, 4);

  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#image-10$/);
});

test('hash history does not restore scroll or move the page cover', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);
  await page.evaluate(() => scrollTo(0, 0));

  const cover = page.locator('.project-cover');
  const coverBefore = await cover.boundingBox();
  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');

  expect(await cover.boundingBox()).toEqual(coverBefore);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);

  await page.evaluate(() => history.forward());
  await waitForLightbox(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('lightbox reports its position and wraps at either end', async ({ page }) => {
  await gotoProject(page);
  const imageCount = await page
    .getByRole('button', { name: /^Open image \d+$/ })
    .count();
  await galleryImage(page, 1).click();
  await waitForLightbox(page);

  const position = page.getByRole('status');
  await expect(position).toHaveText(`1 / ${imageCount}`);

  await page.getByRole('button', { name: 'Previous image' }).click();
  await expect(position).toHaveText(`${imageCount} / ${imageCount}`);

  await page.getByRole('button', { name: 'Next image' }).click();
  await expect(position).toHaveText(`1 / ${imageCount}`);
});

test('header remains in place beneath the lightbox', async ({ page }) => {
  await gotoProject(page);
  await galleryImage(page, 1).scrollIntoViewIfNeeded();
  const header = page.locator('body > header');
  expect((await header.boundingBox())?.y).toBeCloseTo(0, 0);

  await galleryImage(page, 1).click();
  await expectLightboxTransition(page, 'lightbox-open');
  await expect
    .poll(() =>
      page
        .locator('.project-cover')
        .evaluate((cover) => getComputedStyle(cover).viewTransitionName),
    )
    .toBe('none');
  await waitForLightbox(page);
  expect((await header.boundingBox())?.y).toBeCloseTo(0, 0);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');
  expect(
    await page
      .locator('.project-cover')
      .evaluate((cover) => getComputedStyle(cover).viewTransitionName),
  ).toBe('none');
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.project-cover')
        .evaluate((cover) => getComputedStyle(cover).viewTransitionName),
    )
    .toBe('cover-urban-study-kyjov');
});

test('an obscured thumbnail uses the overlay transition without an image morph', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 1);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.evaluate((button) => {
    const header = document.querySelector('body > header')!;
    const buttonBounds = button.getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    scrollBy(0, buttonBounds.top - headerBounds.bottom + 20);
  });
  const target = (await thumbnail.boundingBox())!;
  const header = (await page.locator('body > header').boundingBox())!;
  expect(target.y).toBeLessThan(header.y + header.height);
  expect(target.y + target.height).toBeGreaterThan(header.y + header.height);

  await page.mouse.click(
    target.x + target.width / 2,
    Math.max(header.y + header.height + 10, target.y + target.height / 2),
  );
  await expectLightboxTransition(page, 'lightbox-open');
  await page.waitForTimeout(50);
  const openingMorphsImage = await page.evaluate(() =>
    document
      .getAnimations()
      .some(({ effect }) =>
        (effect as KeyframeEffect | null)?.pseudoElement?.includes(
          'lightbox-image',
        ),
      ),
  );
  await waitForLightbox(page);

  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');
  await page.waitForTimeout(50);
  const closingMorphsImage = await page.evaluate(() =>
    document
      .getAnimations()
      .some(({ effect }) =>
        (effect as KeyframeEffect | null)?.pseudoElement?.includes(
          'lightbox-image',
        ),
      ),
  );

  expect({ openingMorphsImage, closingMorphsImage }).toEqual({
    openingMorphsImage: false,
    closingMorphsImage: false,
  });
});

test('dark theme keeps the lightbox surface black and controls white', async ({
  page,
}) => {
  await gotoProject(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await galleryImage(page, 1).click();
  await waitForLightbox(page);

  const colors = await page.getByRole('dialog', { name: 'Image viewer' }).evaluate(
    (dialog) => {
      const pixels = (color: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      return {
        background: pixels(getComputedStyle(dialog).backgroundColor),
        foreground: pixels(
          getComputedStyle(dialog.querySelector<HTMLButtonElement>('button')!).color,
        ),
      };
    },
  );
  expect(colors.background).toEqual([0, 0, 0, 255]);
  expect(colors.foreground).toEqual([255, 255, 255, 255]);
});

test('2x display density selects enough pixels without exceeding the source', async ({
  browser,
}) => {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  const resolution = await page.locator('.lightbox-slide-current img').evaluate(
    (element) => {
      const image = element as HTMLImageElement;
      return {
        naturalWidth: image.naturalWidth,
        renderedWidth: image.getBoundingClientRect().width,
        sourceWidth: Number(image.getAttribute('width')),
        pixelRatio: devicePixelRatio,
      };
    },
  );
  expect(resolution.naturalWidth).toBeGreaterThanOrEqual(
    Math.min(
      resolution.sourceWidth,
      Math.ceil(resolution.renderedWidth * resolution.pixelRatio),
    ),
  );
  expect(resolution.naturalWidth).toBeLessThanOrEqual(resolution.sourceWidth);
  await context.close();
});

test('a reopened pyramid matches its canvas to a changed display density', async ({
  browserName,
  browser,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright only exposes dynamic display density through CDP',
  );
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await gotoProject(page);
  await galleryImage(page, 2).click();
  await waitForLightbox(page);
  await page.locator('.openseadragon-canvas canvas').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);

  const session = await context.newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  await galleryImage(page, 2).click();
  await waitForLightbox(page);
  const canvas = page.locator('.openseadragon-canvas canvas');
  await canvas.waitFor();

  await expect
    .poll(() =>
      canvas.evaluate(
        (element) =>
          (element as HTMLCanvasElement).width /
          element.getBoundingClientRect().width,
      ),
    )
    .toBe(2);
  await context.close();
});

test('the lightbox is full screen with controls in the corners', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 3).click(); // "Life at the city", one of a set of five
  await waitForLightbox(page);
  const viewport = page.viewportSize()!;
  const box = async (locator: Locator) => (await locator.boundingBox())!;
  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  expect(await box(dialog)).toMatchObject({
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });

  const close = await box(dialog.getByRole('button', { name: 'Close' }));
  expect(close.x + close.width).toBeGreaterThan(viewport.width - 20);
  expect(close.y).toBeLessThan(20);

  const set = dialog.getByRole('navigation', { name: 'Images in this set' });
  await expect(set.getByRole('button')).toHaveCount(5);
  await expect(
    set.getByRole('button', { name: 'Life at the city' }),
  ).toHaveAttribute('aria-current', 'true');
  const setBox = await box(set);
  expect(setBox.x).toBeLessThan(20);
  expect(setBox.y).toBeLessThan(20);

  const original = await box(
    dialog.getByRole('link', { name: 'Open original (3 of 17)' }),
  );
  expect(original.x + original.width).toBeGreaterThan(viewport.width - 20);
  expect(original.y + original.height).toBeGreaterThan(viewport.height - 20);
  await expect(
    dialog.getByRole('button', { name: 'Switch to Czech' }),
  ).toBeVisible();

  const previous = await box(
    dialog.getByRole('button', { name: 'Previous image' }),
  );
  const next = await box(dialog.getByRole('button', { name: 'Next image' }));
  expect(previous.x).toBeLessThan(20);
  expect(next.x + next.width).toBeGreaterThan(viewport.width - 20);
  expect(previous.y + previous.height / 2).toBeCloseTo(viewport.height / 2, 0);
  expect(next.y).toBeCloseTo(previous.y, 0);
});

test('an image outside a set shows its title as a set of one', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 11).click(); // a titled visualization outside any set
  await waitForLightbox(page);
  const set = page.getByRole('navigation', { name: 'Images in this set' });
  await expect(set.getByRole('button')).toHaveCount(1);
  await expect(set.getByRole('button')).toHaveText('Visualization');
  await expect(set.getByRole('button')).toHaveAttribute('aria-current', 'true');
});

test('an image without a title or set shows no set strip', async ({ page }) => {
  await page.goto('/projects/exotarium-brno-zoo/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await galleryImage(page, 2).click();
  await waitForLightbox(page);
  await expect(
    page.getByRole('navigation', { name: 'Images in this set' }),
  ).toHaveCount(0);
});

test('the rest view leaves the control bands clear and zoomed edges can leave the controls', async ({
  page,
}) => {
  await page.goto('/projects/galerie-hang%C3%A1r/#image-5'); // a set member below the tiling size
  await waitForLightbox(page);
  const image = page.locator('.lightbox-slide-current img');
  const set = (await page
    .getByRole('navigation', { name: 'Images in this set' })
    .boundingBox())!;
  const original = (await page
    .getByRole('link', { name: /^Open original/ })
    .boundingBox())!;
  const rest = (await image.boundingBox())!;
  expect(rest.y).toBeGreaterThanOrEqual(set.y + set.height);
  expect(rest.y + rest.height).toBeLessThanOrEqual(original.y);

  await page.mouse.move(rest.x + 5, rest.y + 5);
  await page.mouse.wheel(0, -3000);
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(1200, 700, { steps: 10 });
  await page.mouse.up();
  const zoomed = (await image.boundingBox())!;
  const previous = (await page
    .getByRole('button', { name: 'Previous image' })
    .boundingBox())!;
  expect(zoomed.x).toBeGreaterThanOrEqual(previous.x + previous.width - 1);
  expect(zoomed.y).toBeGreaterThanOrEqual(set.y + set.height - 1);
  expect(zoomed.width).toBeGreaterThan(page.viewportSize()!.width);
});

test('a tiled image corner can be pulled clear of the controls and draws there', async ({
  page,
}) => {
  await page.goto(`${projectPath}#image-3`);
  await waitForLightbox(page);
  await page.locator('.openseadragon-canvas canvas').waitFor();
  const rest = (await page
    .locator('.lightbox-slide-current img')
    .boundingBox())!;
  await page.mouse.move(rest.x + 5, rest.y + 5);
  await page.mouse.wheel(0, -3000);
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(1200, 700, { steps: 10 });
  await page.mouse.up();

  const previous = (await page
    .getByRole('button', { name: 'Previous image' })
    .boundingBox())!;
  const set = (await page
    .getByRole('navigation', { name: 'Images in this set' })
    .boundingBox())!;
  const corner = (await page
    .locator('.lightbox-slide-current img')
    .boundingBox())!;
  expect(corner.x).toBeGreaterThanOrEqual(previous.x + previous.width - 1);
  expect(corner.y).toBeGreaterThanOrEqual(set.y + set.height - 1);

  await expect
    .poll(() => tilesDrawnAt(page, { x: corner.x + 4, y: corner.y + 4 }))
    .toBe(true);
  expect(await tilesDrawnAt(page, { x: corner.x - 4, y: corner.y + 4 })).toBe(false);
  expect(await tilesDrawnAt(page, { x: corner.x + 4, y: corner.y - 4 })).toBe(false);
});

test('on a phone the rest view uses the full width and zooming out clears the arrows', async ({
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
  const image = page.locator('.lightbox-slide-current img');
  expect(Math.round((await image.boundingBox())!.width)).toBe(390);

  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 95, y: 420 },
      { x: 295, y: 420 },
    ],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 175, y: 420 },
      { x: 215, y: 420 },
    ],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const zoomedOut = (await image.boundingBox())!;
  const previous = (await page
    .getByRole('button', { name: 'Previous image' })
    .boundingBox())!;
  const next = (await page
    .getByRole('button', { name: 'Next image' })
    .boundingBox())!;
  expect(zoomedOut.x).toBeGreaterThanOrEqual(previous.x + previous.width - 1);
  expect(zoomedOut.x + zoomedOut.width).toBeLessThanOrEqual(next.x + 1);
  await context.close();
});

test('resizing while zoomed keeps the image within its pan limits', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 3).click(); // a tiled drawing
  await waitForLightbox(page);
  await page.locator('.openseadragon-canvas canvas').waitFor();
  const image = page.locator('.lightbox-slide-current img');
  const rest = (await image.boundingBox())!;
  await page.mouse.move(rest.x + rest.width - 2, rest.y + rest.height - 2);
  await page.mouse.wheel(0, -3000);

  // 800×600: gap 8 px, so the safe area ends 56 px from each edge.
  await page.setViewportSize({ width: 800, height: 600 });
  await expect
    .poll(async () => {
      const box = (await image.boundingBox())!;
      return [Math.round(box.x + box.width), Math.round(box.y + box.height)];
    })
    .toEqual([800 - 56, 600 - 56]);
  await expect
    .poll(() => tilesDrawnAt(page, { x: 800 - 60, y: 600 - 60 }))
    .toBe(true);
  expect(await tilesDrawnAt(page, { x: 800 - 52, y: 600 - 60 })).toBe(false);
});

test.describe('reduced motion', () => {
  test('opens without a transition and keeps swipe movement stationary', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoProject(page);
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(() =>
        matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true);
    await galleryImage(page, 10).click();
    expect(
      await page.evaluate(() =>
        document.documentElement.matches(':active-view-transition'),
      ),
    ).toBe(false);
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();

    const stage = page.locator('.lightbox-stage');
    const currentSlide = page.locator('.lightbox-slide-current');
    const box = (await stage.boundingBox())!;
    const slideBefore = (await currentSlide.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2);
    expect((await currentSlide.boundingBox())!.x).toBeCloseTo(slideBefore.x, 0);
    await page.mouse.up();
    await expect(page).toHaveURL(/#image-11$/);
  });
});

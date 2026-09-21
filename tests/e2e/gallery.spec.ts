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
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText(
    '100%',
  );
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
  await expect(page.getByRole('button', { name: 'Reset zoom' })).not.toHaveText(
    '100%',
  );

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

test('a zoomed image stays clipped to its slide during navigation', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -1200);
  await expect(page.getByRole('button', { name: 'Reset zoom' })).not.toHaveText(
    '100%',
  );
  await page
    .getByRole('button', { name: 'Next image' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .some(
        ({ effect }) =>
          effect instanceof KeyframeEffect &&
          (effect.target as Element | null)?.classList.contains(
            'lightbox-slide-current',
          ),
      ),
  );

  const bleedsPastSlide = await page.locator('.lightbox-slide-current').evaluate(
    (slide) => {
      const animation = slide.getAnimations().at(0)!;
      animation.pause();
      animation.currentTime = 90;
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

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
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

test('the mouse wheel scrolls an overflowing caption without zooming the image', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 2).click();
  await waitForLightbox(page);

  const caption = page.locator('.lightbox-caption-current');
  expect(
    await caption.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await caption.hover();
  await page.mouse.wheel(0, 200);

  await expect
    .poll(() => caption.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText(
    '100%',
  );
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
  expect(colors.background).toEqual([0, 0, 0, 230]);
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

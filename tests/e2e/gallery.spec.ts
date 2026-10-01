import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';

// tests/e2e/pages/[fixture].astro, which the e2e build adds.
const projectPath = '/e2e/project/';
// How many images its lightbox shows.
const total = 24;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

function galleryImage(page: Page, position: number) {
  return page.getByRole('button', {
    name: `Open image ${position}`,
    exact: true,
  });
}

async function gotoProject(page: Page, path = projectPath) {
  await installClock(page);
  await page.goto(path);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

async function waitForLightbox(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Image viewer' });
  await expect(dialog).toBeVisible();
  // Once its drawing has loaded, the opening takes less than a second.
  await page.waitForFunction(() =>
    document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
      ?.complete,
  );
  await page.clock.runFor(1000);
}

/** How dark the lightbox's backdrop is, 0.91 fully open. */
function backdrop(page: Page) {
  return page.evaluate(() => {
    const colour = getComputedStyle(document.querySelector('[data-gallery-lightbox]')!).backgroundColor;
    return Number(/rgba?\([^)]*,\s*([\d.]+)\)$/.exec(colour)?.[1] ?? 1);
  });
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

/**
 * What shows of the current card's drawing: its box as drawn, less what the
 * opening's clip cuts off.
 */
function visibleCard(page: Page) {
  return page.evaluate(() => {
    const drawing = document
      .querySelector('.lightbox-slide-current .lightbox-front > img')!
      .getBoundingClientRect();
    const opening = document.querySelector<HTMLElement>('.lightbox-stage > div')!;
    const box = opening.getBoundingClientRect();
    const scale = box.width / opening.offsetWidth;
    const inset = /inset\(([^)]*)\)/
      .exec(getComputedStyle(opening).clipPath)?.[1]
      .split(' ')
      .map((value) => parseFloat(value) * scale) ?? [0, 0, 0, 0];
    const [top, right, bottom, left] = [inset[0], inset[1] ?? inset[0], inset[2] ?? inset[0], inset[3] ?? inset[1] ?? inset[0]];
    const x = Math.max(drawing.x, box.x + left);
    const y = Math.max(drawing.y, box.y + top);
    return {
      x,
      y,
      width: Math.min(drawing.right, box.right - right) - x,
      height: Math.min(drawing.bottom, box.bottom - bottom) - y,
      drawingWidth: drawing.width,
      opacity: Number(getComputedStyle(opening).opacity),
    };
  });
}

async function renderedThumbnailScale(thumbnail: Locator) {
  return thumbnail.evaluate((button) => {
    const image = button.querySelector('img')!;
    return image.getBoundingClientRect().width / button.clientWidth;
  });
}

test('the card opens from its thumbnail, cropped as it is and at its hover scale, and closes back to it', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  const frame = (await thumbnail.boundingBox())!;
  const hoverSettles = () =>
    thumbnail
      .locator('img')
      .evaluate((image) => Promise.all(image.getAnimations().map((animation) => animation.finished)));
  for (const hover of ['settled', 'mid-way'] as const) {
    await thumbnail.hover();
    if (hover === 'settled') {
      await hoverSettles();
    } else {
      await thumbnail.locator('img').evaluate((image) => {
        for (const animation of image.getAnimations()) {
          animation.pause();
          animation.currentTime = 100;
        }
      });
    }
    const hoverScale = await renderedThumbnailScale(thumbnail);
    await holdTime(page);
    await thumbnail.click();
    await page.waitForFunction(() =>
      document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
        ?.complete,
    );
    // Closed, what shows is the thumbnail's frame, the drawing covering it
    // at the hover scale.
    let shown = await visibleCard(page);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(shown[key], `${hover} ${key}`).toBeCloseTo(frame[key], 0);
    }
    const cover = Math.max(frame.width, frame.height);
    expect(shown.drawingWidth / cover).toBeCloseTo(hoverScale, 2);
    await page.clock.runFor(200);
    const half = await visibleCard(page);
    expect(half.width).toBeGreaterThan(frame.width);
    await page.clock.runFor(400);
    shown = await visibleCard(page);
    const rest = (await page.locator('.lightbox-slide-current .lightbox-front > img').boundingBox())!;
    expect(shown.width).toBeCloseTo(rest.width, 0);
    await page.clock.resume();
    await waitForLightbox(page);

    await holdTime(page);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.clock.runFor(390);
    shown = await visibleCard(page);
    expect(shown.x).toBeCloseTo(frame.x, -1);
    expect(shown.width).toBeCloseTo(frame.width, -1);
    // The thumbnail is the card until it lands.
    expect(await thumbnail.evaluate((button) => getComputedStyle(button).opacity)).toBe('0');
    await page.clock.resume();
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
    await expect(thumbnail).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await thumbnail.locator('img').evaluate((image) => {
      for (const animation of image.getAnimations()) animation.play();
    });
    await hoverSettles();
  }
});

test('input while opening acts at once, and a wheel while closing scrolls the page', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);

  await holdTime(page);
  await thumbnail.click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status')).toHaveText(`11 / ${total}`);
  // Real pointer input, through the browser's own hit testing.
  const next = (await page.getByRole('button', { name: 'Next image' }).boundingBox())!;
  await page.mouse.click(next.x + next.width / 2, next.y + next.height / 2);
  await expect(page.getByRole('status')).toHaveText(`12 / ${total}`);
  await page.mouse.move(640, 450);
  await page.mouse.wheel(0, -1200);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(await backdrop(page)).toBeLessThan(0.91);
  await page.clock.resume();
  await waitForLightbox(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

  await holdTime(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-gallery-lightbox]')).toHaveAttribute('inert');
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY);
  await page.clock.resume();
});

test.describe(() => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('a touch swipe while opening on a phone changes image and leaves the page in place', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoProject(page);
    const thumbnail = galleryImage(page, 10);
    await thumbnail.scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    await holdTime(page);
    await thumbnail.evaluate((button: HTMLButtonElement) => button.click());
    const session = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: 420 }],
      });
    await touch('touchStart', 300);
    for (const x of [250, 200, 150]) await touch('touchMove', x);
    await touch('touchEnd');
    await expect(page.getByRole('status')).toHaveText(`11 / ${total}`);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await page.clock.resume();
    await waitForLightbox(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  });
});

/** Steps the held clock a frame at a time until the card is gone, and returns where it was last. */
async function lastCard(page: Page) {
  let last = await visibleCard(page);
  for (let frame = 0; frame < 60; frame += 1) {
    await page.clock.runFor(16);
    if (!(await page.locator('.lightbox-slide-current').count())) return last;
    last = await visibleCard(page);
  }
  return last;
}

/** Records how far the backdrop has darkened, 1 fully, at every step of the held clock. */
async function openSteps(page: Page, steps: number) {
  const seen = [];
  for (let step = 0; step < steps; step += 1) {
    await page.clock.runFor(16);
    seen.push((await backdrop(page)) / 0.91);
  }
  return seen;
}

/** The largest step between values, and the values going each way. */
function turnsOnce(values: number[]) {
  const steps = values.slice(1).map((value, at) => value - values[at]);
  return { largest: Math.max(...steps.map(Math.abs)), steps };
}

test('Escape while opening turns the opening back from where it is', async ({ page }) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await holdTime(page);
  await thumbnail.click();
  const opening = await openSteps(page, 6);
  expect(opening.at(-1)).toBeGreaterThan(0.2);
  expect(opening.at(-1)).toBeLessThan(0.99);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
  await expect(thumbnail).toBeFocused();
  const closing = await openSteps(page, 40);
  const { largest, steps } = turnsOnce([...opening, ...closing]);
  expect(largest).toBeLessThan(0.3);
  // Up to the Escape, then down from where it was.
  expect(steps.slice(opening.length).every((step) => step <= 0)).toBe(true);
  expect(closing.at(-1)).toBe(0);
  await page.clock.resume();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
});

for (const [when, beforeClose] of [
  ['while it opens', 6],
  ['once it is open', 40],
] as const) {
  test(`opening the same image again while it closes ${when} turns it back from where it is`, async ({
    page,
  }) => {
    await gotoProject(page);
    const thumbnail = galleryImage(page, 2); // a tiled drawing
    await thumbnail.scrollIntoViewIfNeeded();
    await holdTime(page);
    await thumbnail.click();
    const opening = await openSteps(page, beforeClose);
    await page.keyboard.press('Escape');
    const closing = await openSteps(page, 6);
    await expect(thumbnail).toBeFocused();
    await page.keyboard.press('Enter');
    const reopening = await openSteps(page, 40);
    const { largest } = turnsOnce([...opening, ...closing, ...reopening]);
    expect(largest).toBeLessThan(0.3);
    expect(closing.at(-1)).toBeGreaterThan(0);
    expect(closing.at(-1)).toBeLessThan(opening.at(-1)!);
    expect(reopening.at(-1)).toBe(1);
    await page.clock.resume();
    await waitForLightbox(page);
    await expect(page).toHaveURL(/#image-2$/);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('status')).toHaveText(`3 / ${total}`);
    await expect(page.locator('.openseadragon-canvas canvas')).toBeVisible();
  });
}

test('a lightbox closed and opened again a frame later works as ever', async ({ page }) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.keyboard.press('Enter');
  await waitForLightbox(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status')).toHaveText(`11 / ${total}`);
  await expect(page).toHaveURL(/#image-11$/);
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
});

test('a tiled canvas waits for the opening to end', async ({ page }) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 2); // a tiled drawing
  await thumbnail.scrollIntoViewIfNeeded();
  await holdTime(page);
  await thumbnail.click();
  await openSteps(page, 15);
  await page.waitForTimeout(300);
  await expect(page.locator('.openseadragon-canvas')).toHaveCount(0);
  await page.clock.resume();
  await expect(page.locator('.openseadragon-canvas canvas')).toBeVisible();
});

for (const [side, prepare] of [
  [
    'zoomed',
    async (page: Page) => {
      await page.locator('.lightbox-stage').hover();
      await page.mouse.wheel(0, -1200);
      await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
    },
  ],
  [
    'with its description showing',
    async (page: Page) => {
      await page.getByRole('button', { name: 'Show description' }).click();
      await page.clock.runFor(700);
    },
  ],
] as const) {
  test(`closing ${side} only fades, and opening again shows the drawing at rest`, async ({
    page,
  }) => {
    await gotoProject(page);
    const thumbnail = galleryImage(page, 3);
    await thumbnail.scrollIntoViewIfNeeded();
    await thumbnail.click();
    await waitForLightbox(page);
    await prepare(page);
    const before = await visibleCard(page);
    await holdTime(page);
    await page.keyboard.press('Escape');
    await page.clock.runFor(200);
    const fading = await visibleCard(page);
    expect(fading.x).toBeCloseTo(before.x, 0);
    expect(fading.width).toBeCloseTo(before.width, 0);
    expect(fading.opacity).toBeGreaterThan(0);
    expect(fading.opacity).toBeLessThan(1);
    await page.clock.resume();
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
    await expect(thumbnail).toBeFocused();

    await thumbnail.click();
    await waitForLightbox(page);
    await expect(
      page.getByRole('button', { name: 'Show description' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(await imageZoom(page)).toBeCloseTo(1, 2);
  });
}

test('a zoomed image stays clipped to its slide during navigation', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 10).click();
  await waitForLightbox(page);

  await page.locator('.lightbox-stage').hover();
  await page.mouse.wheel(0, -1200);
  await expect.poll(() => imageZoom(page)).toBeGreaterThan(1);
  await holdTime(page);
  await page
    .getByRole('button', { name: 'Next image' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.clock.runFor(90);

  // The zoomed card sliding away.
  const bleedsPastSlide = await page
    .locator('.lightbox-slide:not(.lightbox-slide-current):has([data-lightbox-sheet])')
    .evaluate((slide) => {
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
    });

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
  await expect(page).toHaveURL(/#image-1$/);
});

test('header remains in place beneath the lightbox, and the cover keeps its page transition', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 1).scrollIntoViewIfNeeded();
  const header = page.locator('body > header');
  const coverName = () =>
    page.locator('.project-cover').evaluate((cover) => getComputedStyle(cover).viewTransitionName);
  expect((await header.boundingBox())?.y).toBeCloseTo(0, 0);
  expect(await coverName()).toBe('cover-e2e-project');

  await holdTime(page);
  await galleryImage(page, 1).click();
  await page.clock.runFor(200);
  expect((await header.boundingBox())?.y).toBeCloseTo(0, 0);
  expect(await coverName()).toBe('cover-e2e-project');
  await page.clock.resume();
  await waitForLightbox(page);
  expect((await header.boundingBox())?.y).toBeCloseTo(0, 0);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  expect((await header.boundingBox())?.y).toBeCloseTo(0, 0);
  expect(await coverName()).toBe('cover-e2e-project');
});

test('an obscured thumbnail opens and closes the lightbox with a fade, the card at rest', async ({
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

  await holdTime(page);
  await page.mouse.click(
    target.x + target.width / 2,
    Math.max(header.y + header.height + 10, target.y + target.height / 2),
  );
  await page.waitForFunction(() =>
    document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
      ?.complete,
  );
  await page.clock.runFor(100);
  const opening = await visibleCard(page);
  await page.clock.resume();
  await waitForLightbox(page);
  const rest = await visibleCard(page);

  await holdTime(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.clock.runFor(100);
  const closing = await visibleCard(page);
  await page.clock.resume();

  for (const shown of [opening, closing]) {
    expect(shown.x).toBeCloseTo(rest.x, 0);
    expect(shown.width).toBeCloseTo(rest.width, 0);
    expect(shown.opacity).toBeGreaterThan(0);
    expect(shown.opacity).toBeLessThan(1);
  }
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
  // 90 % black, over the 10 % a modal dialog's own backdrop would add.
  expect(colors.background).toEqual([0, 0, 0, 232]);
  expect(colors.foreground).toEqual([255, 255, 255, 255]);
});

test.describe(() => {
  test.use({ deviceScaleFactor: 2 });

  test('2x display density selects enough pixels without exceeding the source', async ({
    page,
  }) => {
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
  });
});

test.describe(() => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Playwright only exposes dynamic display density through CDP',
  );

  test('a reopened pyramid matches its canvas to a changed display density', async ({
    page,
    context,
  }) => {
    await gotoProject(page);
    await galleryImage(page, 2).click();
    await waitForLightbox(page);
    await page.locator('.openseadragon-canvas canvas').waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
    // Gone from the page: opened again while it fades out, it would go on as it was.
    await expect(page.locator('[data-gallery-lightbox]')).toBeHidden();

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
  });
});

test('the lightbox is full screen with controls in the corners', async ({
  page,
}) => {
  await gotoProject(page);
  await galleryImage(page, 3).click(); // one of a set of five
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
    set.getByRole('button', { name: 'Tiled variant 3' }),
  ).toHaveAttribute('aria-current', 'true');
  const setBox = await box(set);
  expect(setBox.x).toBeLessThan(20);
  expect(setBox.y).toBeLessThan(20);

  const original = await box(
    dialog.getByRole('link', { name: `Open original (3 of ${total})` }),
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
  await galleryImage(page, 11).click(); // a titled image outside any set
  await waitForLightbox(page);
  const set = page.getByRole('navigation', { name: 'Images in this set' });
  await expect(set.getByRole('button')).toHaveCount(1);
  await expect(set.getByRole('button')).toHaveText('View 11');
  await expect(set.getByRole('button')).toHaveAttribute('aria-current', 'true');
});

test('an image without a title or set shows no set strip', async ({ page }) => {
  await page.goto(projectPath);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await galleryImage(page, 21).click();
  await waitForLightbox(page);
  await expect(
    page.getByRole('navigation', { name: 'Images in this set' }),
  ).toHaveCount(0);
});

test('the rest view leaves the control bands clear and zoomed edges can leave the controls', async ({
  page,
}) => {
  await page.goto(`${projectPath}#image-18`); // a set member below the tiling size
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

test.describe(() => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'One touch-capable browser covers this',
  );

  test('on a phone the rest view uses the full width and zooming out clears the arrows', async ({
    page,
    context,
  }) => {
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
  });
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

for (const [route, change] of [
  ['a set button', (page: Page) => page.getByRole('button', { name: 'Tiled variant 5' }).click()],
  ['Next inside the set', (page: Page) => page.getByRole('button', { name: 'Next image' }).click()],
] as const) {
  test(`controls stay above a zoomed drawing while ${route} blends it`, async ({ page }) => {
    await gotoProject(page);
    await galleryImage(page, 3).click();
    await waitForLightbox(page);
    await page.locator('.lightbox-stage').hover();
    await page.mouse.wheel(0, -1200);
    await expect.poll(() => imageZoom(page)).toBeGreaterThan(2);

    await holdTime(page);
    await change(page);
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')].every(
        (image) => image.complete,
      ),
    );
    await page.clock.runFor(90);

    const dialog = page.getByRole('dialog', { name: 'Image viewer' });
    for (const control of [
      dialog.getByRole('button', { name: 'Tiled variant 2' }),
      dialog.getByRole('button', { name: 'Close' }),
      dialog.getByRole('link', { name: /^Open original/ }),
    ]) {
      expect(
        await control.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          return element.contains(hit);
        }),
      ).toBe(true);
      // Inside the border and clear of the label, the control's fill is black.
      const box = (await control.boundingBox())!;
      const pixel = await sharp(
        await page.screenshot({
          clip: { x: box.x + 4, y: box.y + box.height / 2, width: 1, height: 1 },
        }),
      )
        .raw()
        .toBuffer();
      expect([...pixel.subarray(0, 3)]).toEqual([0, 0, 0]);
    }
  });
}

test('the page shows faintly through the backdrop around a card', async ({ page }) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 11); // a wide drawing
  await thumbnail.scrollIntoViewIfNeeded();
  // The sticky header, between the set strip and ×.
  const point = { x: 640, y: 30 };
  const shot = async () =>
    [
      ...(await sharp(
        await page.screenshot({ clip: { ...point, width: 1, height: 1 } }),
      )
        .raw()
        .toBuffer()),
    ].slice(0, 3);
  const pageColour = await shot();
  await thumbnail.click();
  await waitForLightbox(page);

  const seen = await shot();
  for (const [channel, value] of pageColour.entries()) {
    expect(value).toBeGreaterThan(200);
    // 90 % black over the page, under the dialog's own 10 % backdrop.
    expect(seen[channel]).toBeCloseTo(value * 0.1 * 0.9, -1);
  }
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
    expect(await backdrop(page)).toBeCloseTo(0.91, 3);
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

test('opening another image while the lightbox fades out leaves every thumbnail showing once closed', async ({
  page,
}) => {
  await gotoProject(page);
  const [first, second] = [galleryImage(page, 2), galleryImage(page, 3)];
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await waitForLightbox(page);
  await holdTime(page);
  await page.keyboard.press('Escape');
  await page.clock.runFor(150);
  await second.click();
  await page.clock.resume();
  await waitForLightbox(page);
  await expect(page).toHaveURL(/#image-3$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  await page.clock.runFor(1000);
  for (const thumbnail of [first, second]) await expect(thumbnail).toHaveCSS('opacity', '1');
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`with a drawing that never arrives the lightbox still opens and takes input (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await gotoProject(page);
    const thumbnail = galleryImage(page, 10);
    await thumbnail.scrollIntoViewIfNeeded();
    await page.route('**/_responsive/**', () => {});
    await thumbnail.click();
    await page.clock.runFor(1000);
    expect(await backdrop(page)).toBeCloseTo(0.91, 3);
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCSS('opacity', '1');
    // The card has not left the thumbnail, which shows where it is.
    await expect(thumbnail).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('status')).toHaveText(`11 / ${total}`);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.clock.runFor(1000);
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);
  });
}

test('a drawing that arrives late moves from its thumbnail once it has', async ({ page }) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  const frame = (await thumbnail.boundingBox())!;
  let release = () => {};
  const arrived = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/_responsive/**', async (route) => {
    await arrived;
    await route.continue();
  });
  await holdTime(page);
  await thumbnail.click();
  await page.clock.runFor(600);
  // Open, but the card waits at the thumbnail.
  expect(await backdrop(page)).toBeCloseTo(0.91, 3);
  await expect(thumbnail).toHaveCSS('opacity', '1');
  release();
  await page.waitForFunction(() =>
    document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
      ?.complete,
  );
  await page.clock.runFor(32);
  const leaving = await visibleCard(page);
  expect(leaving.width).toBeLessThan(frame.width * 1.5);
  await expect(thumbnail).toHaveCSS('opacity', '0');
  await page.clock.runFor(600);
  const rest = (await page.locator('.lightbox-slide-current .lightbox-front > img').boundingBox())!;
  expect((await visibleCard(page)).width).toBeCloseTo(rest.width, 0);
  await expect(thumbnail).toHaveCSS('opacity', '1');
  await page.clock.resume();
});

test('closing after a change while opening moves the card into the current image’s own thumbnail', async ({
  page,
}) => {
  await gotoProject(page);
  // Side by side in one row.
  const [opened, current] = [galleryImage(page, 9), galleryImage(page, 10)];
  await current.scrollIntoViewIfNeeded();
  const target = (await current.boundingBox())!;
  await holdTime(page);
  await opened.click();
  await page.waitForFunction(() =>
    document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
      ?.complete,
  );
  await page.clock.runFor(100);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() =>
    document.querySelector<HTMLImageElement>('.lightbox-slide-current .lightbox-front > img')
      ?.complete,
  );
  await page.keyboard.press('Escape');
  // Its last frame, a step short of landing.
  const landing = await lastCard(page);
  expect(Math.abs(landing.x - target.x)).toBeLessThan(30);
  expect(Math.abs(landing.y - target.y)).toBeLessThan(30);
  expect(Math.abs(landing.width - target.width)).toBeLessThan(30);
  await page.clock.resume();
});

test('a card closing into its thumbnail follows the thumbnail as the page scrolls', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);
  await holdTime(page);
  await page.keyboard.press('Escape');
  await page.clock.runFor(150);
  await page.evaluate(() => scrollBy(0, 60));
  const target = (await thumbnail.boundingBox())!;
  const landing = await lastCard(page);
  expect(Math.abs(landing.y - target.y)).toBeLessThan(30);
  expect(Math.abs(landing.x - target.x)).toBeLessThan(30);
  await page.clock.resume();
});

test('opened again on another image while it closes, the card waits for that drawing before it moves', async ({
  page,
}) => {
  await gotoProject(page);
  const [first, second] = [galleryImage(page, 10), galleryImage(page, 3)];
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await waitForLightbox(page);
  await page.route('**/_responsive/**', () => {});
  await holdTime(page);
  await page.keyboard.press('Escape');
  await page.clock.runFor(150);
  await second.click();
  const waiting = await visibleCard(page);
  for (let frame = 0; frame < 10; frame += 1) {
    await page.clock.runFor(16);
    const now = await visibleCard(page);
    expect(now.x).toBeCloseTo(waiting.x, 1);
    expect(now.width).toBeCloseTo(waiting.width, 1);
  }
  await expect(page.getByRole('status')).toHaveText(`3 / ${total}`);
  await page.clock.resume();
});

test('opened again while it closes, the thumbnail stays hidden while the card travels from it', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);
  await holdTime(page);
  await page.keyboard.press('Escape');
  await page.clock.runFor(150);
  await expect(thumbnail).toHaveCSS('opacity', '0');
  await page.keyboard.press('Enter');
  for (let frame = 0; frame < 4; frame += 1) {
    await page.clock.runFor(16);
    await expect(thumbnail).toHaveCSS('opacity', '0');
  }
  await page.clock.resume();
  await waitForLightbox(page);
  await expect(thumbnail).toHaveCSS('opacity', '1');
});

test('a card closing into its thumbnail lands where the thumbnail is after a resize', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.click();
  await waitForLightbox(page);
  await holdTime(page);
  await page.keyboard.press('Escape');
  await page.clock.runFor(150);
  await page.setViewportSize({ width: 1240, height: 800 });
  await page.waitForFunction(() => innerWidth === 1240);
  const target = (await thumbnail.boundingBox())!;
  // Almost at the end of its move, the card is within a pixel of landing.
  await page.clock.runFor(234);
  const landing = await visibleCard(page);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(landing[key] - target[key]), key).toBeLessThan(1);
  }
  await page.clock.resume();
});

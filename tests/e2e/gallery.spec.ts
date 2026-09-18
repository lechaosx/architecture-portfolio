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

test('native lightbox transitions keep endpoint geometry stable across repeated use', async ({
  page,
}) => {
  await gotoProject(page);
  const thumbnail = galleryImage(page, 10);
  await thumbnail.scrollIntoViewIfNeeded();

  await thumbnail.click();
  await expectLightboxTransition(page, 'lightbox-open');
  const opening = await sampleBoxes(page.locator('.lightbox-slide-current img'));
  expect(new Set(opening.map((box) => JSON.stringify(box))).size).toBe(1);
  await waitForLightbox(page);

  await page.getByRole('button', { name: 'Close' }).click();
  await expectLightboxTransition(page, 'lightbox-close');
  const closing = await sampleBoxes(thumbnail);
  expect(new Set(closing.map((box) => JSON.stringify(box))).size).toBe(1);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toHaveCount(0);

  await thumbnail.click();
  await expectLightboxTransition(page, 'lightbox-open');
  await waitForLightbox(page);
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
    (image) => ({
      naturalWidth: image.naturalWidth,
      renderedWidth: image.getBoundingClientRect().width,
      sourceWidth: Number(image.getAttribute('width')),
      pixelRatio: devicePixelRatio,
    }),
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

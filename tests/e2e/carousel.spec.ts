import { expect, test, type Page } from '@playwright/test';

async function currentSlide(page: Page) {
  return page.locator('[data-dot]').evaluateAll((dots) =>
    dots.findIndex((dot) => dot.getAttribute('aria-current') === 'true'),
  );
}

async function expectCurrentSlide(page: Page, index: number) {
  await expect.poll(() => currentSlide(page)).toBe(index);
}

test('one selected home image renders as an image rather than a carousel', async ({
  page,
}) => {
  await page.goto('/');

  const media = page.locator('[data-home-media]');
  await expect(media.locator('img')).toHaveCount(1);
  await expect(media.locator('img')).toHaveAttribute(
    'src',
    '/uploads/placeholder-cover.svg',
  );
  const aspectRatios = await media.locator('img').evaluate((element) => {
    const image = element as HTMLImageElement;
    return {
      natural: image.naturalWidth / image.naturalHeight,
      rendered: image.clientWidth / image.clientHeight,
    };
  });
  expect(aspectRatios.rendered).toBeCloseTo(aspectRatios.natural, 2);
  await expect(page.locator('[data-carousel]')).toHaveCount(0);
});

test('carousel arrows and dots navigate and wrap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  test.skip(
    (await page.locator('[data-carousel]').count()) === 0,
    'Requires at least two selected homepage images',
  );
  const dots = page.locator('[data-dot]');
  const last = (await dots.count()) - 1;
  expect(last).toBeGreaterThan(0);
  await expectCurrentSlide(page, 0);

  await page.getByRole('button', { name: 'Next image' }).click();
  await expectCurrentSlide(page, 1);
  await page.getByRole('button', { name: 'Previous image' }).click();
  await expectCurrentSlide(page, 0);
  await page.getByRole('button', { name: 'Previous image' }).click();
  await expectCurrentSlide(page, last);
  await dots.nth(2).click();
  await expectCurrentSlide(page, 2);
});

test('carousel auto-advance pauses while hovered or focused', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright Clock does not advance Firefox smooth scrolling',
  );
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const carousel = page.locator('[data-carousel]');
  test.skip(
    (await carousel.count()) === 0,
    'Requires at least two selected homepage images',
  );
  await expectCurrentSlide(page, 0);

  await carousel.hover();
  await page.clock.fastForward(10_000);
  await expectCurrentSlide(page, 0);

  await page.mouse.move(0, 0);
  await page.clock.fastForward(5_000);
  await page.clock.runFor(1_000);
  await expectCurrentSlide(page, 1);

  await page.getByRole('button', { name: 'Next image' }).focus();
  await page.clock.fastForward(10_000);
  await expectCurrentSlide(page, 1);

  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.fastForward(10_000);
  await expectCurrentSlide(page, 1);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.fastForward(5_000);
  await page.clock.runFor(1_000);
  await expectCurrentSlide(page, 2);
});

test('carousel does not auto-advance with reduced motion', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  test.skip(
    (await page.locator('[data-carousel]').count()) === 0,
    'Requires at least two selected homepage images',
  );
  await expectCurrentSlide(page, 0);

  await page.clock.fastForward(20_000);
  await expectCurrentSlide(page, 0);
});

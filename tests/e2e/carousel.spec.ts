import { expect, test, type Page } from '@playwright/test';

async function currentSlide(page: Page) {
  return page.locator('[data-dot]').evaluateAll((dots) =>
    dots.findIndex((dot) => dot.getAttribute('aria-current') === 'true'),
  );
}

async function expectCurrentSlide(page: Page, index: number) {
  await expect.poll(() => currentSlide(page)).toBe(index);
}

test('carousel arrows and dots navigate and wrap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
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
  await expectCurrentSlide(page, 0);

  await page.clock.fastForward(20_000);
  await expectCurrentSlide(page, 0);
});

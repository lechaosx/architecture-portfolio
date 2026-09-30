import { expect, test, type Locator, type Page } from '@playwright/test';

// Built by the e2e build (E2E_FIXTURES) from src/pages/[fixture].astro.
const fixture = '/e2e-carousels/';

async function currentSlide(page: Page, dot = '[data-dot]') {
  return page.locator(dot).evaluateAll((dots) =>
    dots.findIndex((dot) => dot.getAttribute('aria-current') === 'true'),
  );
}

async function expectCurrentSlide(page: Page, index: number) {
  await expect.poll(() => currentSlide(page)).toBe(index);
}

// Resolves once the page's own listeners have seen the change, so that a
// following clock jump cannot run ahead of it.
async function changeReducedMotion(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  const changed = page.evaluate(
    () =>
      new Promise((resolve) =>
        matchMedia('(prefers-reduced-motion: reduce)').addEventListener(
          'change',
          resolve,
          { once: true },
        ),
      ),
  );
  await page.emulateMedia({ reducedMotion });
  await changed;
}

test('carousels do not widen the page on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixture);
  await expect(page.locator('[data-carousel]')).toHaveCount(1);
  await expect(page.locator('[data-project-carousel]')).toHaveCount(1);

  const overflow = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.pageWidth).toBeLessThanOrEqual(overflow.viewportWidth);
});

test('one selected home image renders as an image rather than a carousel', async ({
  page,
}) => {
  await page.goto('/e2e-single-image/');

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
  await page.goto(fixture);
  const dots = page.locator('[data-dot]');
  const last = (await dots.count()) - 1;
  expect(last).toBeGreaterThan(0);
  await expectCurrentSlide(page, 0);
  const carousel = page.locator('[data-carousel]');

  await carousel.getByRole('button', { name: 'Next image' }).click();
  await expectCurrentSlide(page, 1);
  await carousel.getByRole('button', { name: 'Previous image' }).click();
  await expectCurrentSlide(page, 0);
  await carousel.getByRole('button', { name: 'Previous image' }).click();
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
  await page.goto(fixture);
  const carousel = page.locator('[data-carousel]');
  await expectCurrentSlide(page, 0);

  await carousel.hover();
  await page.clock.fastForward(10_000);
  await expectCurrentSlide(page, 0);

  await page.mouse.move(0, 0);
  await page.clock.fastForward(5_000);
  await page.clock.runFor(1_000);
  await expectCurrentSlide(page, 1);

  await carousel.getByRole('button', { name: 'Next image' }).focus();
  await page.clock.fastForward(10_000);
  await expectCurrentSlide(page, 1);

  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await changeReducedMotion(page, 'reduce');
  await page.clock.fastForward(10_000);
  await expectCurrentSlide(page, 1);

  await changeReducedMotion(page, 'no-preference');
  await page.clock.fastForward(5_000);
  await page.clock.runFor(1_000);
  await expectCurrentSlide(page, 2);
});

test('carousel does not auto-advance with reduced motion', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fixture);
  await expectCurrentSlide(page, 0);

  await page.clock.fastForward(20_000);
  await expectCurrentSlide(page, 0);
});

for (const { name, carousel, track, dot } of [
  {
    name: 'home carousel',
    carousel: '[data-carousel]',
    track: '[data-carousel-track]',
    dot: '[data-dot]',
  },
  {
    name: 'project image-set carousel',
    carousel: '[data-project-carousel]',
    track: '[data-project-carousel-track]',
    dot: '[data-project-dot]',
  },
]) {
  test.describe(`${name} takes every input at once`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(fixture);
      await page.locator(carousel).scrollIntoViewIfNeeded();
    });

    const parts = (page: Page) => {
      const root = page.locator(carousel);
      return {
        dots: root.locator(dot),
        next: root.getByRole('button', { name: 'Next image' }),
        previous: root.getByRole('button', { name: 'Previous image' }),
        track: root.locator(track),
      };
    };
    // Both clicks land in one task, before the first scroll has moved at all.
    const clickInOneGo = async (page: Page, buttons: Locator[]) => {
      const handles = await Promise.all(buttons.map((b) => b.elementHandle()));
      await page.evaluate((elements) => {
        for (const element of elements) (element as HTMLElement).click();
      }, handles);
    };
    // Where the track comes to rest, in slides: still for ten frames.
    const restsAt = (page: Page) =>
      parts(page).track.evaluate(async (element) => {
        let last = NaN;
        for (let still = 0; still < 10; ) {
          await new Promise(requestAnimationFrame);
          still = element.scrollLeft === last ? still + 1 : 0;
          last = element.scrollLeft;
        }
        return last / element.clientWidth;
      });

    test('a quick second Next is not lost', async ({ page }) => {
      const { next } = parts(page);
      await clickInOneGo(page, [next, next]);
      expect(await currentSlide(page, dot)).toBe(2);
      expect(await restsAt(page)).toBeCloseTo(2, 2);
    });

    test('Next then Previous returns to the first image', async ({ page }) => {
      const { next, previous } = parts(page);
      await clickInOneGo(page, [next, previous]);
      expect(await currentSlide(page, dot)).toBe(0);
      expect(await restsAt(page)).toBeCloseTo(0, 2);
      expect(await currentSlide(page, dot)).toBe(0);
    });

    test('Next during the wrap to the first image goes one further', async ({
      page,
    }) => {
      const { dots, next } = parts(page);
      const last = (await dots.count()) - 1;
      await dots.nth(last).click();
      expect(await restsAt(page)).toBeCloseTo(last, 2);
      await next.click();
      await next.click();
      expect(await currentSlide(page, dot)).toBe(1);
      expect(await restsAt(page)).toBeCloseTo(1, 2);
    });

    test('a dot marks itself current as it is clicked', async ({ page }) => {
      await parts(page).dots.nth(2).click();
      expect(await currentSlide(page, dot)).toBe(2);
      expect(await restsAt(page)).toBeCloseTo(2, 2);
    });

    test('a vertical wheel over a sliding strip leaves the current image', async ({
      page,
    }) => {
      const { next, track } = parts(page);
      const box = (await track.boundingBox())!;
      await next.click();
      await page.waitForTimeout(60);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 40);
      await next.click();
      expect(await currentSlide(page, dot)).toBe(2);
      expect(await restsAt(page)).toBeCloseTo(2, 2);
    });

    test("the visitor's own scrolling moves the current image", async ({
      page,
    }) => {
      const { next, track } = parts(page);
      const box = (await track.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(box.width, 0);
      expect(await restsAt(page)).toBeCloseTo(1, 2);
      await expect.poll(() => currentSlide(page, dot)).toBe(1);
      await next.click();
      expect(await currentSlide(page, dot)).toBe(2);
      expect(await restsAt(page)).toBeCloseTo(2, 2);
    });
  });
}

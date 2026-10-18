import { expect, test, type Locator, type Page } from '@playwright/test';

// tests/e2e/pages/[fixture].astro, which the e2e build adds.
const fixture = '/e2e/carousel/';
const carousel = '[data-carousel]';
const track = '[data-carousel-track]';
const dot = '[data-carousel-dot]';
const sources = [
  '/e2e/images/placeholder-cover.svg',
  '/e2e/images/placeholder-1.svg',
  '/e2e/images/placeholder-2.svg',
];

async function currentSlide(page: Page) {
  return page.locator(dot).evaluateAll((dots) =>
    dots.findIndex((dot) => dot.getAttribute('aria-current') === 'true'),
  );
}

const parts = (page: Page) => {
  const root = page.locator(carousel);
  return {
    dots: root.locator(dot),
    next: root.getByRole('button', { name: 'Next image' }),
    previous: root.getByRole('button', { name: 'Previous image' }),
    track: root.locator(track),
  };
};

// The project image set and the landing page's hero are one carousel.
for (const path of [fixture, '/e2e/landing/']) {
  test(`the carousel does not widen the page on mobile at ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator(carousel)).toHaveCount(1);

    const overflow = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.pageWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  });
}

test('one landing image shows at its natural ratio, not as a carousel', async ({ page }) => {
  await page.goto('/e2e/landing-single/');
  const hero = page.locator('main img').first();
  await expect(hero).toHaveAttribute('src', '/e2e/images/placeholder-cover.svg');
  const aspectRatios = await hero.evaluate((element) => {
    const image = element as HTMLImageElement;
    return {
      natural: image.naturalWidth / image.naturalHeight,
      rendered: image.clientWidth / image.clientHeight,
    };
  });
  expect(aspectRatios.rendered).toBeCloseTo(aspectRatios.natural, 2);
  await expect(page.locator(carousel)).toHaveCount(0);
});

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

test('the landing carousel auto-advances, pausing while hovered or focused', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright Clock does not advance Firefox smooth scrolling',
  );
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/e2e/landing/');
  const { next } = parts(page);
  await expect.poll(() => currentSlide(page)).toBe(0);

  await page.locator(carousel).hover();
  await page.clock.fastForward(10_000);
  await expect.poll(() => currentSlide(page)).toBe(0);

  await page.mouse.move(0, 0);
  await page.clock.fastForward(5_000);
  await page.clock.runFor(1_000);
  await expect.poll(() => currentSlide(page)).toBe(1);

  await next.focus();
  await page.clock.fastForward(10_000);
  await expect.poll(() => currentSlide(page)).toBe(1);

  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await changeReducedMotion(page, 'reduce');
  await page.clock.fastForward(10_000);
  await expect.poll(() => currentSlide(page)).toBe(1);

  await changeReducedMotion(page, 'no-preference');
  await page.clock.fastForward(5_000);
  await page.clock.runFor(1_000);
  await expect.poll(() => currentSlide(page)).toBe(2);
});

test('the landing carousel does not auto-advance with reduced motion', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/e2e/landing/');
  await expect.poll(() => currentSlide(page)).toBe(0);
  await page.clock.fastForward(20_000);
  await expect.poll(() => currentSlide(page)).toBe(0);
});

test('a project image set does not auto-advance', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(fixture);
  await page.clock.fastForward(20_000);
  await expect.poll(() => currentSlide(page)).toBe(0);
});

test('arrows and dots navigate and wrap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fixture);
  const { dots, next, previous } = parts(page);
  const last = (await dots.count()) - 1;
  expect(last).toBeGreaterThan(1);
  await expect(page.locator(carousel).getByRole('button', { name: /Open image/ })).toHaveCount(last + 1);
  await expect.poll(() => currentSlide(page)).toBe(0);

  await next.click();
  await expect.poll(() => currentSlide(page)).toBe(1);
  await previous.click();
  await expect.poll(() => currentSlide(page)).toBe(0);
  await previous.click();
  await expect.poll(() => currentSlide(page)).toBe(last);
  await dots.nth(1).click();
  await expect.poll(() => currentSlide(page)).toBe(1);
});

test('wrap-around keeps moving toward the adjacent image', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(fixture);
  const { dots, next, previous, track } = parts(page);
  const first = '/e2e/images/placeholder-cover.svg';
  const last = '/e2e/images/placeholder-2.svg';

  const motion = async (button: Locator, source: string) => {
    const handle = await button.elementHandle();
    return track.evaluate(async (element, { button, source }) => {
      (button as HTMLElement).click();
      const offsets: number[] = [];
      for (let frame = 0; frame < 8; frame++) {
        await new Promise(requestAnimationFrame);
        const bounds = element.getBoundingClientRect();
        for (const image of element.querySelectorAll('img')) {
          const imageBounds = image.getBoundingClientRect();
          if (image.getAttribute('src') === source && imageBounds.right > bounds.left && imageBounds.left < bounds.right) {
            offsets.push((imageBounds.left - bounds.left) / bounds.width);
          }
        }
      }
      return offsets;
    }, { button: handle, source });
  };

  const backwards = await motion(previous, first);
  expect(backwards.some((offset) => offset > 0.01 && offset < 1)).toBe(true);
  await expect.poll(async () => track.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('img')].find((image) =>
      Math.abs(image.getBoundingClientRect().left - bounds.left) < 1,
    )?.getAttribute('src');
  })).toBe(last);
  expect(await currentSlide(page)).toBe((await dots.count()) - 1);

  const forwards = await motion(next, last);
  expect(forwards.some((offset) => offset < -0.01 && offset > -1)).toBe(true);
  expect(await currentSlide(page)).toBe(0);
});

test('with reduced motion the track jumps straight to the new image', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fixture);
  const { next, track } = parts(page);
  await next.click();
  expect(await track.evaluate((element) => {
    const left = element.getBoundingClientRect().left;
    return [...element.querySelectorAll('img')].find((image) =>
      Math.abs(image.getBoundingClientRect().left - left) < 1,
    )?.getAttribute('src');
  })).toBe(sources[1]);
});

test('the lightbox closes into the visible carousel image', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/e2e/set-first/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  const thumbnail = page.getByRole('button', { name: /^Open image 1\b/ });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await thumbnail.click();
  await expect.poll(() => page.locator('.lightbox-slide-current .lightbox-front > img')
    .evaluate((image) => (image as HTMLImageElement).complete)).toBe(true);
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-gallery-lightbox]')).not.toHaveAttribute('open', '');
  await page.clock.runFor(100);
  await expect(thumbnail).toHaveCSS('opacity', '0');
  await page.clock.runFor(1000);
  await expect(thumbnail).toHaveCSS('opacity', '1');
});

test('clicking the incoming image during wrap opens its lightbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/e2e/set-first/');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const { previous, next, track } = parts(page);
  await previous.click();
  await page.clock.runFor(1000);
  await next.click();
  await page.clock.runFor(100);
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();
  await expect(page).toHaveURL(/#image-1$/);
});

test.describe('the carousel takes every input at once', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(fixture);
  });

  // Both clicks land in one task, before the first scroll has moved at all.
  const clickInOneGo = async (page: Page, buttons: Locator[]) => {
    const handles = await Promise.all(buttons.map((b) => b.elementHandle()));
    await page.evaluate((elements) => {
      for (const element of elements) (element as HTMLElement).click();
    }, handles);
  };
  // Ten still frames distinguish a settled slide from one passing through.
  const restsAt = (page: Page) =>
    parts(page).track.evaluate(async (element, sources) => {
      let last = NaN;
      for (let still = 0; still < 10; ) {
        await new Promise(requestAnimationFrame);
        still = element.scrollLeft === last ? still + 1 : 0;
        last = element.scrollLeft;
      }
      const left = element.getBoundingClientRect().left;
      const source = [...element.querySelectorAll('img')].find((image) =>
        Math.abs(image.getBoundingClientRect().left - left) < 1,
      )?.getAttribute('src');
      return sources.indexOf(source ?? '');
    }, sources);

  test('a quick second Next is not lost', async ({ page }) => {
    const { next } = parts(page);
    await clickInOneGo(page, [next, next]);
    expect(await currentSlide(page)).toBe(2);
    expect(await restsAt(page)).toBeCloseTo(2, 2);
  });

  test('Next then Previous returns to the first image', async ({ page }) => {
    const { next, previous } = parts(page);
    await clickInOneGo(page, [next, previous]);
    expect(await currentSlide(page)).toBe(0);
    expect(await restsAt(page)).toBeCloseTo(0, 2);
    expect(await currentSlide(page)).toBe(0);
  });

  test('many quick turns can cross both boundaries without losing state', async ({ page }) => {
    const { next, previous } = parts(page);
    await clickInOneGo(page, Array(8).fill(previous));
    expect(await currentSlide(page)).toBe(1);
    expect(await restsAt(page)).toBe(1);
    await clickInOneGo(page, Array(9).fill(next));
    expect(await currentSlide(page)).toBe(1);
    expect(await restsAt(page)).toBe(1);
  });

  test('changing direction continues from the visible position', async ({ page }) => {
    const { next, previous, track } = parts(page);
    await next.click();
    await page.waitForTimeout(60);
    const handle = await previous.elementHandle();
    const movement = await track.evaluate((element, button) => {
      const before = element.scrollLeft;
      (button as HTMLElement).click();
      return { before, after: element.scrollLeft, width: element.clientWidth };
    }, handle);
    expect(movement.before / movement.width).toBeGreaterThan(1);
    expect(movement.before / movement.width).toBeLessThan(2);
    expect(movement.after).toBe(movement.before);
    expect(await currentSlide(page)).toBe(0);
    expect(await restsAt(page)).toBe(0);
  });

  test('resizing during a turn keeps its destination', async ({ page }) => {
    await parts(page).next.click();
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: 640, height: 800 });
    expect(await currentSlide(page)).toBe(1);
    expect(await restsAt(page)).toBe(1);
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
    expect(await currentSlide(page)).toBe(1);
    expect(await restsAt(page)).toBeCloseTo(1, 2);
  });

  test('a dot marks itself current as it is clicked', async ({ page }) => {
    await parts(page).dots.nth(2).click();
    expect(await currentSlide(page)).toBe(2);
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
    expect(await currentSlide(page)).toBe(2);
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
    await expect.poll(() => currentSlide(page)).toBe(1);
    await next.click();
    expect(await currentSlide(page)).toBe(2);
    expect(await restsAt(page)).toBeCloseTo(2, 2);
  });

  test('native scrolling also wraps through the adjacent boundary image', async ({ page }) => {
    const { track, next } = parts(page);
    const box = (await track.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(-box.width, 0);
    expect(await restsAt(page)).toBe(2);
    expect(await currentSlide(page)).toBe(2);
    await next.click();
    expect(await currentSlide(page)).toBe(0);
    expect(await restsAt(page)).toBe(0);
    await parts(page).previous.click();
    expect(await restsAt(page)).toBe(2);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(box.width, 0);
    expect(await restsAt(page)).toBe(0);
    expect(await currentSlide(page)).toBe(0);
  });
});

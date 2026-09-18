import { expect, test } from '@playwright/test';

test('work cards do not start a second entrance animation after navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Work' }).click();
  await expect(page).toHaveURL(/\/work\/?$/);

  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
  await expect(project).toBeVisible();
  const frames = await project.evaluate(async (element) => {
    const values = [];
    for (let frame = 0; frame < 4; frame += 1) {
      const style = getComputedStyle(element);
      values.push({ opacity: style.opacity, transform: style.transform });
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  expect(frames).toEqual(
    Array.from({ length: 4 }, () => ({ opacity: '1', transform: 'none' })),
  );
});

test('cover hover does not change the shared transition box', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/work');
  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
  const transitionCover = project.locator('.project-cover');
  const image = project.locator('img');
  const before = await transitionCover.boundingBox();
  const imageBefore = (await image.boundingBox())!;

  await project.hover();
  await page.waitForTimeout(350);
  expect(await transitionCover.boundingBox()).toEqual(before);
  expect((await image.boundingBox())!.width).toBeGreaterThan(imageBefore.width);
});

test('opening a project starts a cross-document view transition', async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName === 'firefox',
    'The pinned Firefox does not support cross-document View Transitions',
  );
  await page.addInitScript(() => {
    addEventListener('pagereveal', (event) => {
      sessionStorage.setItem(
        'page-transition-started',
        String(Boolean((event as PageRevealEvent).viewTransition)),
      );
    });
  });
  await page.goto('/work');
  await page.evaluate(() => sessionStorage.removeItem('page-transition-started'));

  await page.locator('a[href="/projects/urban-study-kyjov/"]').click();
  await expect(page).toHaveURL(/\/projects\/urban-study-kyjov\/$/);
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('page-transition-started')),
    )
    .toBe('true');
});

test('non-square project cover uses the shared crop transition class', async ({
  page,
}) => {
  await page.goto('/work');
  const project = page.locator('a[href="/projects/urban-study-kyjov/"]');
  await project.click();
  await expect(page).toHaveURL(/\/projects\/urban-study-kyjov\/$/);

  const cover = page.locator('.project-cover');
  await expect(cover).toBeVisible();
  expect(
    await cover.evaluate((image) => getComputedStyle(image).viewTransitionClass),
  ).toBe('project-cover');
  const box = (await cover.boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(1.2);
});

import { expect, test } from '@playwright/test';
import type { ImageManifest } from '../../src/images';

for (const listing of ['work', 'landing']) {
  test(`${listing} cards and share previews use the chosen thumbnail`, async ({ page }) => {
    await page.goto(`/e2e/thumbnail-${listing}/`);
    const { images } = await (await page.request.get('/_responsive/manifest.json')).json() as ImageManifest;
    for (const [kind, source] of [['first', 'cover.png'], ['later', 'square-2.png'], ['standalone', 'wide.png'], ['text', 'wide.png']]) {
      const card = page.locator(`main .grid > a[href="/en/projects/e2e-thumbnail-${kind}/"]`);
      if (listing === 'landing' && kind === 'text') continue;
      expect(await card.locator('img').getAttribute('srcset')).toContain(images[`/e2e/images/${source}`].variants[0].url);
    }
    await expect(page.locator('main .grid > a[href="/en/projects/e2e-thumbnail-empty/"]')).toHaveCount(0);
    if (listing === 'work') await expect(page.getByText('Thumbnail empty', { exact: true })).toBeVisible();
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toContain(images['/e2e/images/square-2.png'].share.url);
  });
}

for (const [kind, source] of [['later', 'square-2.png'], ['standalone', 'wide.png'], ['text', 'wide.png']]) {
  test(`the ${kind} thumbnail is shared without changing page images or lightbox order`, async ({ page }) => {
    await page.goto(`/en/projects/e2e-thumbnail-${kind}/`);
    const { images } = await (await page.request.get('/_responsive/manifest.json')).json() as ImageManifest;
    const chosen = images[`/e2e/images/${source}`];
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toContain(chosen.share.url);
    expect(await page.locator('meta[name="twitter:image"]').getAttribute('content')).toContain(chosen.share.url);
    const graph = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)['@graph'];
    const work = graph.find((node: Record<string, unknown>) => node['@type'] === 'CreativeWork');
    expect(work.image[0].contentUrl).toContain(chosen.variants.find(({ width }) => width === 2560)?.url ?? chosen.variants.at(-1)!.url);
    expect(work.image.filter((image: { contentUrl: string }) => image.contentUrl === work.image[0].contentUrl)).toHaveLength(1);
    await expect(page.locator('article .project-cover')).toHaveCount(0);
    const buttons = page.locator('article [data-lightbox-index]');
    await expect(buttons).toHaveCount(kind === 'text' ? 0 : 2);
    if (kind === 'text') {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      return;
    }
    await expect(buttons.first().locator('img')).toHaveAttribute('loading', 'eager');
    await expect(buttons.nth(1).locator('img')).toHaveAttribute('loading', 'lazy');
    await expect(buttons.first().locator('img')).toHaveAttribute('src', '/e2e/images/cover.png');
    await expect(buttons.nth(1).locator('img')).toHaveAttribute('src', '/e2e/images/square-2.png');
    await buttons.nth(1).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('View', { exact: true })).toBeVisible();
  });
}

test('an explicitly chosen first image retains the card morph', async ({ page }) => {
  await page.goto('/e2e/thumbnail-work/');
  await page.locator('a[href="/en/projects/e2e-thumbnail-first/"]').click();
  await expect(page.locator('article .project-cover')).toHaveAttribute('data-lightbox-index', '0');
});

test('cards crossfade when the thumbnail has no matching image at the top of the page', async ({ page }) => {
  await page.goto('/e2e/thumbnail-work/');
  for (const kind of ['later', 'standalone', 'text']) {
    const card = page.locator(`a[href="/en/projects/e2e-thumbnail-${kind}/"]`);
    await expect(card.locator('.project-cover')).toHaveCount(0);
    expect(await card.locator('div').first().evaluate((element) => getComputedStyle(element).viewTransitionName)).toBe('none');
  }
});

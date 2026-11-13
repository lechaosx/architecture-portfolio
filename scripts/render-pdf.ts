import type { Browser } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const minimumBodyTextPt = 9;
const maximumBytes = 10_000_000;

export function smallTextWarning(pdf: string, scale: number, bodyPx: number) {
  const pt = (bodyPx * 0.75 * scale) / 100;
  if (pt >= minimumBodyTextPt) return;
  return `${pdf}: bio text prints at ${pt.toFixed(2)} pt at ${scale}% scale, below the ${minimumBodyTextPt} pt minimum; shorten the content to enlarge it.`;
}

export function largeFileWarning(pdf: string, bytes: number) {
  if (bytes <= maximumBytes) return;
  return `${pdf}: ${(bytes / 1e6).toFixed(1)} MB, above the ${maximumBytes / 1e6} MB email attachments are often limited to; include fewer images.`;
}

// Prints the page at `url` to the PDF its alternate link names. Content
// problems come back as warnings, so a CMS save never stops the deploy; only a
// broken setup, such as missing fonts, throws.
export async function renderPDF(browser: Browser, url: string, { site, onePage }: { site: string; onePage: boolean }) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const origin = new URL(url).origin;
    const warnings: string[] = [];
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      warnings.push(`blocked a request to another site: ${route.request().url()}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('response', (response) => {
      if (response.status() >= 400) warnings.push(`${response.status()}: ${response.url()}`);
    });
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).origin === origin) warnings.push(`${request.failure()?.errorText}: ${request.url()}`);
    });
    await page.emulateMedia({ media: 'print' });
    await page.goto(url, { waitUntil: 'load' });
    const pdf = await page.locator('link[rel="alternate"][type="application/pdf"]').getAttribute('href');
    if (!pdf) throw new Error(`${url} names no PDF`);

    const { bodyPx, brokenImages } = await page.evaluate(async (site) => {
      await document.fonts.ready;
      for (const family of ['Roboto Variable', 'Roboto Condensed Variable']) {
        if ((await document.fonts.load(`16px "${family}"`)).length === 0) throw new Error(`${family} did not load`);
      }
      const brokenImages = await Promise.all(
        [...document.images].map((image) => image.decode().then(() => '', () => image.currentSrc || image.src)),
      );
      // The page is served by the build's preview server, so its own links are
      // pointed at the public site. Rich text can hold a link no parser accepts,
      // such as `http://`; it prints as it is.
      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        if (!URL.canParse(link.href)) continue;
        const target = new URL(link.href);
        if (target.origin === location.origin) link.href = new URL(target.pathname + target.search + target.hash, site).href;
      }
      const bio = document.querySelector('main .prose p') ?? document.body;
      return { bodyPx: parseFloat(getComputedStyle(bio).fontSize), brokenImages: brokenImages.filter(Boolean) };
    }, site);
    warnings.push(...brokenImages.map((src) => `image could not be shown: ${src}`));

    const render = async (scale: number) => {
      const bytes = await page.pdf({ preferCSSPageSize: true, scale: scale / 100, printBackground: true, tagged: true });
      return { bytes, scale, pages: (await PDFDocument.load(bytes)).getPageCount() };
    };
    let result = await render(100);
    if (onePage && result.pages > 1) {
      // Chromium prints at 10% to 200%.
      const smallest = await render(10);
      if (smallest.pages > 1) {
        warnings.push(`${pdf}: does not fit one page even at 10% scale; printed on ${result.pages} pages.`);
      } else {
        result = smallest;
        let upper = 99;
        while (result.scale < upper) {
          const attempt = await render(Math.ceil((result.scale + upper) / 2));
          if (attempt.pages === 1) result = attempt;
          else upper = attempt.scale - 1;
        }
      }
    }
    const smallText = onePage ? smallTextWarning(pdf, result.scale, bodyPx) : undefined;
    if (smallText) warnings.push(smallText);
    const largeFile = largeFileWarning(pdf, result.bytes.length);
    if (largeFile) warnings.push(largeFile);
    return { ...result, pdf, warnings };
  } finally {
    await context.close();
  }
}

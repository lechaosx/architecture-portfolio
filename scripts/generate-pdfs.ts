// Prints each language's print pages in dist/ to PDFs at the site root, then
// removes the print pages, which only exist to be printed.
import { rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { preview } from 'astro';
import config from '../astro.config.mjs';
import { renderPDF } from './render-pdf.ts';

const kinds = [{ kind: 'cv', onePage: true }];
const dist = new URL('../dist/', import.meta.url);

const server = await preview({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  browser = await chromium.launch();
  for (const lang of ['cs', 'en']) {
    for (const { kind, onePage } of kinds) {
      const { bytes, pdf, pages, scale, warnings } = await renderPDF(
        browser,
        `http://127.0.0.1:${server.port}/${lang}/print/${kind}/`,
        { site: config.site!, onePage },
      );
      await writeFile(new URL(`.${pdf}`, dist), bytes);
      console.log(`PDF ${pdf}: ${pages} page(s) at ${scale}%, ${(bytes.length / 1e6).toFixed(1)} MB`);
      // A GitHub Actions annotation, so a content problem shows on the run.
      for (const warning of warnings) console.log(`::warning title=PDF ${pdf}::${warning}`);
    }
  }
  await Promise.all(['cs', 'en'].map((lang) => rm(new URL(`${lang}/print/`, dist), { recursive: true })));
} finally {
  try {
    await browser?.close();
  } finally {
    await server.stop();
  }
}

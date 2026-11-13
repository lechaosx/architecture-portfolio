import { expect, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { renderPDF } from '../../scripts/render-pdf.ts';
import { contact } from './architect';

test.skip(({ browserName }) => browserName !== 'chromium', 'Only Chromium prints PDFs');

const site = 'https://example.org';
const a4 = { width: 595.28, height: 841.89 };

const links = (pdf: PDFDocument) =>
  pdf.getPages().flatMap((page) =>
    (page.node.Annots()?.asArray() ?? []).flatMap((annotation) => {
      const uri = pdf.context.lookup(annotation, PDFDict).lookupMaybe(PDFName.of('A'), PDFDict)?.lookup(PDFName.of('URI'));
      return uri instanceof PDFString || uri instanceof PDFHexString ? [uri.decodeText()] : [];
    }),
  );

test('the CV prints on one tagged A4 portrait page linking its contacts and the public site', async ({ browser, baseURL }) => {
  const result = await renderPDF(browser, `${baseURL}/cs/e2e/cv/`, { site, onePage: true });
  expect(result.pdf).toBe('/Klara-Svobodova-cv-cs.pdf');
  expect(result.warnings).toEqual([]);
  const pdf = await PDFDocument.load(result.bytes);
  expect(pdf.getPageCount()).toBe(1);
  const size = pdf.getPage(0).getSize();
  expect(size.width).toBeCloseTo(a4.width, 0);
  expect(size.height).toBeCloseTo(a4.height, 0);
  expect(pdf.getTitle()).toBe('Životopis | Ing. arch. Klára Svobodová');
  expect(pdf.catalog.has(PDFName.of('StructTreeRoot'))).toBe(true);
  expect(links(pdf)).toEqual(expect.arrayContaining([`mailto:${contact.email}`, 'tel:+420777000000', `${site}/cs/`, `${site}/cs/work/`, `${site}/cs/projects/e2e-2024/`, 'https://www.linkedin.com/in/klara-svobodova']));
  expect(links(pdf).filter((link) => link.startsWith(baseURL!))).toEqual([]);
});

test('a CV too long for one page shrinks onto one and warns that its text is below 9 pt', async ({ browser, baseURL }) => {
  const result = await renderPDF(browser, `${baseURL}/en/e2e/cv-long/`, { site, onePage: true });
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
  expect(result.scale).toBeLessThan(100);
  expect(result.warnings).toEqual([expect.stringContaining('below the 9 pt minimum')]);
});

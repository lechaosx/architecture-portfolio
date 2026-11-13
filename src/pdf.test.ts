import { expect, test } from 'vitest';
import { pdfPath } from './pdf';

test('a PDF path names the person without diacritics, the kind and the language', () => {
  expect(pdfPath('Tereza Kalábková', 'cv', 'cs')).toBe('/Tereza-Kalabkova-cv-cs.pdf');
  expect(pdfPath('Ing. Jan  Ňůžek', 'portfolio', 'en')).toBe('/Ing-Jan-Nuzek-portfolio-en.pdf');
  expect(pdfPath('!!!', 'cv', 'en')).toBe('/cv-en.pdf');
});

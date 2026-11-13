import { expect, test } from 'vitest';
import { largeFileWarning, smallTextWarning } from './render-pdf';

test('warns when the fitted profile text prints below 9 pt', () => {
  expect(smallTextWarning('/a-cv-cs.pdf', 74, 16)).toContain('8.88 pt at 74%');
  expect(smallTextWarning('/a-cv-cs.pdf', 75, 16)).toBeUndefined();
});

test('warns when a PDF passes 10 MB', () => {
  expect(largeFileWarning('/a-portfolio-cs.pdf', 10_000_001)).toContain('/a-portfolio-cs.pdf');
  expect(largeFileWarning('/a-portfolio-cs.pdf', 10_000_000)).toBeUndefined();
});

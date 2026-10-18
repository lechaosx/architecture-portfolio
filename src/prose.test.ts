import { expect, test } from 'vitest';
import { canSplitProse } from './prose';

test.each([0, 1, 149])('%i words stay in one prose column', (length) => {
  expect(canSplitProse(Array(length).fill('project').join(' '))).toBe(false);
});

test.each([150, 151, 300])('%i words can use two readable prose columns', (length) => {
  expect(canSplitProse(Array(length).fill('project').join(' '))).toBe(true);
});

test('word count treats line breaks, paragraphs and nonbreaking spaces as separators', () => {
  const words = Array(150).fill('návrh');
  for (const separator of [' ', '\n', '\n\n', '\t', '\u00a0']) {
    expect(canSplitProse(`  ${words.join(separator)}  `)).toBe(true);
    expect(canSplitProse(words.slice(1).join(separator))).toBe(false);
  }
  expect(canSplitProse(' \n\t\u00a0 ')).toBe(false);
});

test('each translation decides independently', () => {
  const prose = { cs: Array(149).fill('návrh').join(' '), en: Array(150).fill('design').join(' ') };
  expect(canSplitProse(prose.cs)).toBe(false);
  expect(canSplitProse(prose.en)).toBe(true);
});

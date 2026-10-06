import { expect, test } from 'vitest';
import { onlyIn } from './i18n';

test.each([
  ['both languages', 'Brno', 'Brno', undefined],
  ['Czech only', 'Brno', undefined, 'cs'],
  ['English only', '', 'Brno', 'en'],
])('a pair filled in %s', (_, cs, en, lang) => {
  expect(onlyIn(cs, en)).toBe(lang);
});

import { expect, test } from 'vitest';
import { bindOneLetterWords } from './one-letter-words';

const nbsp = '\u00A0';

test.each([
  ['a preposition', 'mlýnů v Pardubicích', `mlýnů v${nbsp}Pardubicích`],
  ['consecutive one-letter words', 'a v Brně', `a${nbsp}v${nbsp}Brně`],
  ['every one of them', 'k s z o u i', `k${nbsp}s${nbsp}z${nbsp}o${nbsp}u${nbsp}i`],
  ['a capital at a sentence start', 'Hotovo. V roce 2020', `Hotovo. V${nbsp}roce 2020`],
  ['after an opening parenthesis', 'park (v centru)', `park (v${nbsp}centru)`],
  ['after an opening quote', '„a pak“', `„a${nbsp}pak“`],
  ['after a line break', 'První řádek\nv Brně', `První řádek\nv${nbsp}Brně`],
  ['before a number, leaving the number', 's 3 podlažími', `s${nbsp}3 podlažími`],
  ['a run of spaces, as one space', 'v   Brně', `v${nbsp}Brně`],
  ['an existing no-break space', `v${nbsp}Brně`, `v${nbsp}Brně`],
  ['a trailing space', 'plochy v ', `plochy v${nbsp}`],
])('binds %s to the next word', (_, text, bound) => {
  expect(bindOneLetterWords(text)).toBe(bound);
});

test.each([
  ['at the very end of the text', 'stojí v'],
  ['before punctuation', 'body a, b'],
  ['before a line break', 'První řádek a\nDruhý řádek'],
  ['ending a word', 'Kyjov je jav'],
  ['after a digit', 'dům 5a je'],
  ['that is not one of them', 'x y ž'],
  ['after a combining mark', 'e\u0301v je'],
  ['after a slash', 'I/O je'],
  ['in a link', 'web.cz/a b'],
  ['after a hyphen', 'od A-Z je'],
])('leaves a letter %s', (_, text) => {
  expect(bindOneLetterWords(text)).toBe(text);
});

test.each([
  ['a newline', 'plochy v\nBrně', `plochy v${nbsp}Brně`],
  ['spaces around a newline', 'plochy v \n Brně', `plochy v${nbsp}Brně`],
  ['a trailing newline', 'plochy v\n', `plochy v${nbsp}`],
])('where newlines are spaces, binds the next word across %s', (_, text, bound) => {
  expect(bindOneLetterWords(text, { newlinesAreSpaces: true })).toBe(bound);
});

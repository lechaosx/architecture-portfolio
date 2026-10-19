import { expect, test } from 'vitest';
import { preferredLanguage, routeLanguage, localizedPath, neutralPath } from './locale';

test.each([
  ['cs', ['en-US'], 'cs'], ['en', ['cs-CZ'], 'en'],
  ['cz', ['de-DE', 'cs-CZ', 'en'], 'cs'],
  [null, ['de', 'en-GB', 'cs'], 'en'],
  [null, ['de', 'fr'], 'en'], [null, [], 'en'],
  ['', ['CS-cz'], 'cs'], ['fr', ['sk', 'cs'], 'cs'],
])('language selection: saved %j and browser %j selects %s', (saved, browser, expected) => {
  expect(preferredLanguage(saved, browser)).toBe(expected);
});

test('only a complete supported prefix sets the route language', () => {
  expect(routeLanguage('/cs/about/')).toBe('cs');
  expect(routeLanguage('/en/')).toBe('en');
  for (const path of ['/', '/english/', '/cz/', '/about/']) expect(routeLanguage(path)).toBeUndefined();
});

test('translated routes preserve encoded slugs, query and image anchor', () => {
  expect(localizedPath('/cs/projects/k%C5%99%C3%AD%C5%BEovice/?view=plan#image-3', 'en'))
    .toBe('/en/projects/k%C5%99%C3%AD%C5%BEovice/?view=plan#image-3');
  expect(localizedPath('/', 'cs')).toBe('/cs/');
  expect(localizedPath('/about/', 'en')).toBe('/en/about/');
  expect(neutralPath('/en/about/?x=1#work')).toBe('/about/?x=1#work');
});

import { describe, expect, test } from 'vitest';
import { DATE, formatPeriod, isoDate, latestFirst, periodIssues } from './period';

test.each([
  ['2023', true],
  ['3/2023', true],
  ['03/2023', true],
  ['12/2023', true],
  ['0/2023', false],
  ['13/2023', false],
  ['3/', false],
  ['2023/3', false],
  ['3-2023', false],
  ['23', false],
  [' 2023', false],
])('a date is a year or a month and year: %j', (text, valid) => {
  expect(DATE.test(text)).toBe(valid);
});

test.each([
  ['2023', '2023'],
  ['3/2023', '2023-03'],
  ['12/2023', '2023-12'],
])('%s is %s in ISO 8601', (text, iso) => {
  expect(isoDate(text)).toBe(iso);
});

describe('formatPeriod', () => {
  test.each([
    ['a one-year period once', '2025', '2025', '2025'],
    ['years', '2023', '2024', '2023–2024'],
    ['months', '3/2023', '6/2024', '3/2023–6/2024'],
    ['a month on one side only', '2023', '6/2024', '2023–6/2024'],
    ['a one-month period once', '3/2024', '03/2024', '3/2024'],
    ['a year and a month of it as two dates', '2024', '3/2024', '2024–3/2024'],
  ])('shows %s', (_, from, to, text) => {
    expect(formatPeriod({ from, to })).toEqual({ cs: text, en: text });
  });

  test('shows an ongoing period as running until now, in each language', () => {
    expect(formatPeriod({ from: '3/2024' })).toEqual({ cs: '3/2024–dosud', en: '3/2024–present' });
  });

  test('shows nothing without a start', () => {
    expect(formatPeriod({})).toBeUndefined();
  });
});

describe('periodIssues', () => {
  test.each([
    ['no period', {}],
    ['an ongoing period', { from: '3/2024' }],
    ['a one-year period', { from: '2024', to: '2024' }],
    ['an end in the start’s year', { from: '6/2024', to: '2024' }],
    ['an end month in the start’s year', { from: '2024', to: '3/2024' }],
  ])('accepts %s', (_, period) => {
    expect(periodIssues(period)).toEqual([]);
  });

  test.each([
    ['an end without a start', { to: '2024' }],
    ['an end year before the start', { from: '2024', to: '2023' }],
    ['an end month before the start', { from: '6/2024', to: '3/2024' }],
  ])('rejects %s', (_, period) => {
    expect(periodIssues(period).map((issue) => issue.field)).toEqual(['to']);
  });
});

test('latest first: ongoing, then by end, then by start, a year without a month covering the whole year', () => {
  const periods = {
    'ongoing since 2020': { from: '2020' },
    'ongoing since 2023': { from: '2023' },
    '2024': { from: '2024', to: '2024' },
    '6/2024': { from: '6/2024', to: '6/2024' },
    '3/2023–2024': { from: '3/2023', to: '2024' },
    '2023–2024': { from: '2023', to: '2024' },
    '2022–2024': { from: '2022', to: '2024' },
    '2023': { from: '2023', to: '2023' },
  };
  const shuffled = Object.entries(periods).reverse();
  expect(shuffled.sort(([, a], [, b]) => latestFirst(a, b)).map(([name]) => name)).toEqual([
    'ongoing since 2023',
    'ongoing since 2020',
    '2024',
    '3/2023–2024',
    '2023–2024',
    '2022–2024',
    '6/2024',
    '2023',
  ]);
  expect(latestFirst({ from: '2024', to: '2024' }, { from: '2024', to: '2024' })).toBe(0);
});

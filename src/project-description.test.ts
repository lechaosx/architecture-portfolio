import { describe, expect, test } from 'vitest';
import { projectDescription, shortList } from './project-description';

const text = (cs: string, en = 'English text.') => ({ type: 'text' as const, body: { cs, en } });
const gallery = { type: 'gallery' as const, images: [{ image: '/uploads/plan.png' }] };

describe('projectDescription', () => {
  test('is the brief, on one line', () => {
    expect(
      projectDescription({
        brief: { cs: 'První řádek\nDruhý řádek', en: 'First line\nSecond line' },
        blocks: [text('Text projektu.')],
      }),
    ).toEqual({ cs: 'První řádek Druhý řádek', en: 'First line Second line' });
  });

  test('is the first text block as plain text when there is no brief', () => {
    expect(
      projectDescription({
        blocks: [
          gallery,
          text('Návrh **propojuje** [architekturu](https://example.com)\n\na _přírodu_ & vodu.'),
          text('Druhý blok.'),
        ],
      }),
    ).toEqual({ cs: 'Návrh propojuje architekturu a přírodu & vodu.', en: 'English text.' });
  });

  test('cuts long text at a word boundary within 160 characters', () => {
    const words = 'Výkres sleduje, jak se náměstí, park a stadion potkávají podél řeky.';
    const { cs } = projectDescription({ blocks: [text(Array(4).fill(words).join(' '))] });
    expect(cs!.length).toBeLessThanOrEqual(160);
    expect(cs).toMatch(/^Výkres sleduje, .*\S…$/);
    expect(`${words} ${words} ${words}`.startsWith(cs!.slice(0, -1))).toBe(true);
    expect(`${words} ${words} ${words}`.charAt(cs!.length - 1)).toBe(' ');
  });

  test('keeps words apart at line breaks, and punctuation next to emphasis', () => {
    expect(
      projectDescription({ blocks: [text('První řádek  \nDruhý řádek<br>třetí **řádek**, konec.')] }).cs,
    ).toBe('První řádek Druhý řádek třetí řádek, konec.');
  });

  test('cuts text with no space before the limit at the limit', () => {
    const { cs } = projectDescription({ blocks: [text('a'.repeat(200))] });
    expect(cs).toBe(`${'a'.repeat(159)}…`);
  });

  test('is absent without a brief or text', () => {
    expect(projectDescription({ blocks: [gallery] })).toEqual({
      cs: undefined,
      en: undefined,
    });
  });
});

describe('shortList', () => {
  const title = (letter: string) => `${letter} ${'x'.repeat(48)}`;

  test('joins whole items, as many as fit within 160 characters, then an ellipsis', () => {
    expect(shortList(['A', 'B'])).toBe('A, B');
    expect(shortList(['A', 'B', 'C', 'D'].map(title))).toBe(`${['A', 'B', 'C'].map(title).join(', ')}…`);
  });

  test('cuts a first item too long to fit at a word boundary', () => {
    expect(shortList([`${'slovo '.repeat(40)}`, 'B'])).toBe(`${'slovo '.repeat(26).trimEnd()}…`);
  });
});

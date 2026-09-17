import { describe, expect, test } from 'bun:test';
import { responsiveSrcset } from './images';

describe('responsiveSrcset', () => {
  test('maps an upload to encoded responsive image URLs', () => {
    expect(
      responsiveSrcset('/uploads/Půdorys 1.NP.png', [320, 640]),
    ).toBe(
      '/_responsive/P%C5%AFdorys%201.NP.png.320.webp 320w, /_responsive/P%C5%AFdorys%201.NP.png.640.webp 640w',
    );
  });

  test('leaves SVG images unprocessed', () => {
    expect(responsiveSrcset('/uploads/placeholder.svg', [320])).toBeUndefined();
  });
});

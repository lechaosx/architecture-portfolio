import { createHash } from 'node:crypto';

export function imageCacheKey(
  source: Uint8Array,
  recipe: Record<string, unknown>,
) {
  return createHash('sha256')
    .update(source)
    .update('\0')
    .update(JSON.stringify(recipe))
    .digest('hex');
}

export function derivativeWidths(
  sourceWidth: number,
  widths: readonly number[],
) {
  return [...widths.filter((width) => width < sourceWidth), sourceWidth];
}

export function shouldPublishDerivative(
  sourceBytes: number,
  derivativeBytes: number,
) {
  return derivativeBytes < sourceBytes;
}

export function webpPolicy(format: string, hasAlpha: boolean) {
  if (format === 'png' || hasAlpha) {
    return { lossless: true, effort: 4 } as const;
  }

  return {
    lossless: false,
    quality: 90,
    alphaQuality: 100,
    smartSubsample: true,
    effort: 4,
    preset: 'picture',
  } as const;
}

export function shouldGenerateDeepZoom(width: number, height: number) {
  return Math.max(width, height) > 4096;
}

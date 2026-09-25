import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

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

export function displaySourceUrl(
  originalUrl: string,
  cacheKey: string,
  extension: string,
) {
  return /%2b/i.test(originalUrl)
    ? `/_responsive/${cacheKey}/source.${extension}`
    : originalUrl;
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

export function deepZoomLevels(width: number, height: number) {
  const maximumLevel = Math.ceil(Math.log2(Math.max(width, height)));
  return Array.from({ length: maximumLevel + 1 }, (_, level) => {
    const divisor = 2 ** (maximumLevel - level);
    return {
      level,
      width: Math.ceil(width / divisor),
      height: Math.ceil(height / divisor),
    };
  });
}

export function deepZoomOverlap(lossless: boolean) {
  return lossless ? 1 : 16;
}

/**
 * Output entries (relative paths) that hold no published file, reduced to the
 * top-most ones so each stale tree is removed in one step.
 */
export function staleOutputs(
  entries: readonly string[],
  published: ReadonlySet<string>,
) {
  const kept = new Set<string>();
  for (const file of published) {
    for (let path = file; path !== '.'; path = dirname(path)) kept.add(path);
  }
  const stale = new Set(entries.filter((entry) => !kept.has(entry)));
  return [...stale].filter((entry) => !stale.has(dirname(entry)));
}

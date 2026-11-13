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

// Vite's dev and preview servers leave `%2B` undecoded and 404 (https://github.com/vitejs/vite/issues/20799).
export function displaySourceUrl(
  originalUrl: string,
  cacheKey: string,
  extension: string,
) {
  return /%2b/i.test(originalUrl)
    ? `/_responsive/${cacheKey}/source.${extension}`
    : originalUrl;
}

// Read from the chunks because sharp's metadata does not say which codec a WebP
// uses. A lossless WebP holds a VP8L bitstream, first or after the extended
// format's VP8X and metadata chunks. An animated one keeps its frames in ANMF
// chunks and counts as lossy.
function isLosslessWebp(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  for (let offset = 12; offset + 8 <= file.byteLength; ) {
    const chunk = String.fromCharCode(...file.subarray(offset, offset + 4));
    if (chunk === 'VP8L') return true;
    if (chunk === 'VP8 ') return false;
    const size = view.getUint32(offset + 4, true);
    offset += 8 + size + (size % 2);
  }
  return false;
}

export function webpPolicy(
  format: string,
  hasAlpha: boolean,
  source: Uint8Array,
) {
  if (
    format === 'png' ||
    hasAlpha ||
    (format === 'webp' && isLosslessWebp(source))
  ) {
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

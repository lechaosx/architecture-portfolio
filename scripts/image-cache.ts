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
  return widths.filter((width) => width < sourceWidth);
}

export function shouldPublishDerivative(
  sourceBytes: number,
  derivativeBytes: number,
) {
  return derivativeBytes < sourceBytes;
}

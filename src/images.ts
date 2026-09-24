export const THUMBNAIL_WIDTHS = [320, 480, 640, 960, 1280] as const;
export const LARGE_IMAGE_WIDTHS = [640, 960, 1280, 1920, 2560] as const;
export const GENERATED_IMAGE_WIDTHS = [
  320, 480, 640, 960, 1280, 1920, 2560,
] as const;

export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export interface ResponsiveImage {
  originalUrl: string;
  source: ImageVariant;
  variants: ImageVariant[];
  deepZoom?: {
    url: string;
    width: number;
    height: number;
    tileSize: number;
    overlap: number;
    format: string;
  };
}

export interface ImageManifest {
  version: 3;
  images: Record<string, ResponsiveImage>;
}

export function displayImageUrl(
  image: ResponsiveImage | undefined,
  fallback: string,
) {
  return image && image.source.url !== image.originalUrl
    ? image.source.url
    : fallback;
}

type CoverSizeSlot =
  | { media?: string; fixed: number }
  | { media?: string; viewport: number; gutter: number };

export function coverSizes(
  imageAspectRatio: number,
  boxAspectRatio: number,
  slots: readonly CoverSizeSlot[],
  scale = 1,
) {
  const factor = Math.max(1, imageAspectRatio / boxAspectRatio) * scale;
  const formatted = (value: number) => String(Number(value.toFixed(4)));

  return slots
    .map((slot) => {
      const size =
        'fixed' in slot
          ? `${formatted(slot.fixed * factor)}px`
          : `calc(${formatted(slot.viewport * factor)}vw - ${formatted(slot.gutter * factor)}px)`;
      return slot.media ? `${slot.media} ${size}` : size;
    })
    .join(', ');
}

export function responsiveSrcset(
  image: ResponsiveImage | undefined,
  widths: readonly number[],
) {
  if (!image) return;

  const requestedWidths = new Set(widths);
  const terminal =
    image.variants.find(({ width }) => width === image.source.width) ??
    image.source;
  const variants = image.variants.filter(
    (variant) =>
      variant.url !== terminal.url && requestedWidths.has(variant.width),
  );
  variants.push(terminal);
  variants.sort((first, second) => first.width - second.width);

  return variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ');
}

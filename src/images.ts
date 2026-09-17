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
  version: 2;
  images: Record<string, ResponsiveImage>;
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

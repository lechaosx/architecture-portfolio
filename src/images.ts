const UPLOAD_PREFIX = '/uploads/';
const RASTER_EXTENSION = /\.(?:avif|jpe?g|png|webp)$/i;

export const THUMBNAIL_WIDTHS = [320, 480, 640, 960, 1280] as const;
export const LARGE_IMAGE_WIDTHS = [640, 960, 1280, 1920, 2560] as const;
export const GENERATED_IMAGE_WIDTHS = [
  320, 480, 640, 960, 1280, 1920, 2560,
] as const;

function responsiveVariant(src: string, width: number) {
  if (!src.startsWith(UPLOAD_PREFIX) || !RASTER_EXTENSION.test(src)) return;

  const relativePath = src.slice(UPLOAD_PREFIX.length);
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/_responsive/${encodedPath}.${width}.webp`;
}

export function responsiveSrcset(src: string, widths: readonly number[]) {
  const variants = widths.map((width) => {
    const url = responsiveVariant(src, width);
    return url && `${url} ${width}w`;
  });

  return variants.every(Boolean) ? variants.join(', ') : undefined;
}

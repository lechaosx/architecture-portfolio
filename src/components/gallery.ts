import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n';
import type { ResponsiveImage } from '../images';

type ProjectBlock = CollectionEntry<'projects'>['data']['blocks'][number];

export type GalleryImage = Extract<
  ProjectBlock,
  { type: 'gallery' | 'image_set' }
>['images'][number];

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const CONTROL_SIZE = 40;

export interface ZoomRange {
  min: number;
  max: number;
}

export interface LightboxAreas {
  /** Distance of the corner controls from the screen edges. */
  gap: number;
  /** Depth of a control band: gap, control, gap. */
  band: number;
  /** Where the image fits at 100%: the viewport minus the top and bottom bands. */
  rest: Size;
  /** What pan limits and the zoom floor respect: the rest area minus the side bands too. */
  safe: Size;
}

export function lightboxAreas(viewport: Size): LightboxAreas {
  const gap = Math.min(
    16,
    Math.max(8, 0.012 * Math.min(viewport.width, viewport.height)),
  );
  const band = 2 * gap + CONTROL_SIZE;
  return {
    gap,
    band,
    rest: { width: viewport.width, height: viewport.height - 2 * band },
    safe: {
      width: viewport.width - 2 * band,
      height: viewport.height - 2 * band,
    },
  };
}

export function zoomFloor(restImage: Size, safe: Size) {
  return Math.min(
    1,
    safe.width / restImage.width,
    safe.height / restImage.height,
  );
}

export function doubleTapScale(scale: number, range: ZoomRange) {
  return scale === 1 ? Math.min(2.5, range.max) : 1;
}

export function clampScale(scale: number, range: ZoomRange) {
  return Math.min(range.max, Math.max(range.min, scale));
}

export function imageText(
  image: GalleryImage | undefined,
  field: 'title' | 'description',
  lang: Lang,
) {
  return image?.[`${field}_${lang}`]?.trim() || undefined;
}

export function comparisonSetIndexes(
  images: GalleryImage[],
  currentIndex: number,
) {
  const set = images[currentIndex]?.comparison_set?.trim();
  if (!set) return [];
  const indexes = images.flatMap((image, index) =>
    image.comparison_set?.trim() === set ? [index] : [],
  );
  return indexes.length > 1 ? indexes : [];
}

export function sharedMaximumScale(maxScales: number[]) {
  return maxScales.length ? Math.min(...maxScales) : 1;
}

export function scaleFromWheel(
  scale: number,
  deltaY: number,
  range: ZoomRange,
) {
  return clampScale(scale * Math.exp(-deltaY * 0.002), range);
}

export function panForZoom(
  pan: Point,
  scale: number,
  nextScale: number,
  pointerFromCenter: Point,
): Point {
  const ratio = nextScale / scale;
  return {
    x: pointerFromCenter.x - ratio * (pointerFromCenter.x - pan.x),
    y: pointerFromCenter.y - ratio * (pointerFromCenter.y - pan.y),
  };
}

export function scaleFromPinch(
  scale: number,
  startDistance: number,
  distance: number,
  range: ZoomRange,
) {
  return startDistance > 0
    ? clampScale(scale * (distance / startDistance), range)
    : scale;
}

export function panForPinch(
  pan: Point,
  scale: number,
  nextScale: number,
  startCenter: Point,
  center: Point,
): Point {
  const ratio = nextScale / scale;
  return {
    x: center.x - ratio * (startCenter.x - pan.x),
    y: center.y - ratio * (startCenter.y - pan.y),
  };
}

/**
 * An axis that fits the rest area stays centred; a larger one may slide until
 * its edge reaches the safe area's edge, so every part of it can be brought out
 * from under the controls.
 */
export function clampPan(
  pan: Point,
  scale: number,
  image: Size,
  areas: Pick<LightboxAreas, 'rest' | 'safe'>,
): Point {
  const limit = (extent: number, rest: number, safe: number) =>
    extent <= rest ? 0 : (extent - safe) / 2;
  const maxX = limit(image.width * scale, areas.rest.width, areas.safe.width);
  const maxY = limit(image.height * scale, areas.rest.height, areas.safe.height);
  return {
    x: maxX === 0 ? 0 : Math.min(maxX, Math.max(-maxX, pan.x)),
    y: maxY === 0 ? 0 : Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

export function containedImageSize(image: Size, viewport: Size): Size {
  const fit = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  return { width: image.width * fit, height: image.height * fit };
}

/**
 * OpenSeadragon viewport for an image drawn `imageWidth` px wide and offset by
 * `pan` from the container centre. Its world is one image width wide, so zoom 1
 * spans the container width.
 */
export function deepZoomViewport(
  imageCenter: Point,
  containerWidth: number,
  imageWidth: number,
  pan: Point,
) {
  return {
    zoom: imageWidth / containerWidth,
    center: {
      x: imageCenter.x - pan.x / imageWidth,
      y: imageCenter.y - pan.y / imageWidth,
    },
  };
}

export function swipeDirection(deltaX: number, deltaY: number) {
  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return 0;
  return deltaX < 0 ? 1 : -1;
}


export function displayedSwipeOffset(deltaX: number, reducedMotion: boolean) {
  return reducedMotion ? 0 : deltaX;
}

export function galleryImageHash(index: number) {
  return `#image-${index + 1}`;
}

export function galleryImageIndex(hash: string, imageCount: number) {
  const match = /^#image-([1-9]\d*)$/.exec(hash);
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  return index < imageCount ? index : undefined;
}

export function nativeZoomScale(
  sourceWidth: number,
  renderedWidth: number,
  devicePixelRatio: number,
) {
  if (renderedWidth <= 0 || devicePixelRatio <= 0) return 1;
  return Math.max(1, sourceWidth / (renderedWidth * devicePixelRatio));
}

export function lightboxImageUrl(
  image: ResponsiveImage,
  viewport: Size,
  scale: number,
  devicePixelRatio: number,
) {
  const aspectRatio = image.source.width / image.source.height;
  const renderedWidth = Math.min(
    viewport.width,
    viewport.height * aspectRatio,
  );
  const requiredWidth = Math.min(
    renderedWidth * scale * devicePixelRatio,
    image.source.width,
  );
  const variant = [...image.variants]
    .sort((first, second) => first.width - second.width)
    .find(({ width }) => width >= requiredWidth);

  return variant?.url ?? image.source.url;
}

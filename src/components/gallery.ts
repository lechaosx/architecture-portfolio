import type { CollectionEntry } from 'astro:content';
import type { ResponsiveImage } from '../images';

export type GalleryImage = CollectionEntry<'projects'>['data']['gallery'][number];

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

const MIN_SCALE = 1;
function clampScale(scale: number, maxScale = Number.POSITIVE_INFINITY) {
  return Math.min(maxScale, Math.max(MIN_SCALE, scale));
}

export function hasCaption(image: GalleryImage) {
  return [
    image.title_cs,
    image.title_en,
    image.description_cs,
    image.description_en,
  ].some((value) => Boolean(value?.trim()));
}

export function scaleFromWheel(
  scale: number,
  deltaY: number,
  maxScale?: number,
) {
  return clampScale(scale * Math.exp(-deltaY * 0.002), maxScale);
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
  maxScale?: number,
) {
  return startDistance > 0
    ? clampScale(scale * (distance / startDistance), maxScale)
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

export function clampPan(
  pan: Point,
  scale: number,
  image: Size,
  viewport: Size,
): Point {
  const maxX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport.height) / 2);
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

export function deepZoomViewport(
  homeZoom: number,
  homeCenter: Point,
  viewportWidth: number,
  scale: number,
  pan: Point,
) {
  const zoom = homeZoom * scale;
  return {
    zoom,
    center: {
      x: homeCenter.x - pan.x / (viewportWidth * zoom),
      y: homeCenter.y - pan.y / (viewportWidth * zoom),
    },
  };
}

export function swipeDirection(deltaX: number, deltaY: number) {
  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return 0;
  return deltaX < 0 ? 1 : -1;
}

export function focusWrapTarget(
  currentIndex: number,
  focusableCount: number,
  backwards: boolean,
) {
  if (focusableCount === 0) return undefined;
  if (currentIndex < 0) return backwards ? focusableCount - 1 : 0;
  if (backwards && currentIndex === 0) return focusableCount - 1;
  if (!backwards && currentIndex === focusableCount - 1) return 0;
  return undefined;
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

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
const MAX_SCALE = 5;

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function hasCaption(image: GalleryImage) {
  return [
    image.title_cs,
    image.title_en,
    image.description_cs,
    image.description_en,
  ].some((value) => Boolean(value?.trim()));
}

export function scaleFromWheel(scale: number, deltaY: number) {
  return clampScale(scale * Math.exp(-deltaY * 0.002));
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
) {
  return startDistance > 0
    ? clampScale(scale * (distance / startDistance))
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
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

export function swipeDirection(deltaX: number, deltaY: number) {
  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return 0;
  return deltaX < 0 ? 1 : -1;
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
  const requiredWidth = renderedWidth * scale * devicePixelRatio;
  const variant = [...image.variants]
    .sort((first, second) => first.width - second.width)
    .find(({ width }) => width >= requiredWidth);

  return variant?.url ?? image.source.url;
}

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

/** At or below this width the side arrows step aside while the text shows. */
export const PHONE_WIDTH = 480;
const TEXT_MEASURE = 672;
const PHONE_MARGIN = 24;

export function cardPadding(cardWidth: number) {
  return Math.min(64, Math.max(24, 0.06 * cardWidth));
}

/** The text column: the page measure, inside the card's padding and the viewport's limit. */
export function cardColumn(cardWidth: number, columnLimit: number) {
  return Math.min(
    TEXT_MEASURE,
    cardWidth - 2 * cardPadding(cardWidth),
    columnLimit,
  );
}

/** The widest text column the stage offers: clear of the side arrows, or the page margins on phones. */
export function textColumnLimit(stageWidth: number, band: number) {
  return (
    stageWidth - 2 * (stageWidth <= PHONE_WIDTH ? PHONE_MARGIN : band)
  );
}

/**
 * The smallest scale, at least 1, of the rest-fitted image at which its card
 * holds the text: `textHeight` measures the text at a column width.
 */
export function cardScale(
  restImage: Size,
  columnLimit: number,
  textHeight: (columnWidth: number) => number,
) {
  const overflows = (scale: number) => {
    const width = restImage.width * scale;
    return (
      textHeight(cardColumn(width, columnLimit)) + 2 * cardPadding(width) >
      restImage.height * scale
    );
  };
  if (!overflows(1)) return 1;
  let low = 1;
  let high = 2;
  while (overflows(high)) [low, high] = [high, 2 * high];
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (overflows(middle)) low = middle;
    else high = middle;
  }
  return high;
}

/** Where the back shows its card, always centred across the stage. */
export interface CardView {
  scale: number;
  /** Offset of the card's centre below the stage centre. */
  y: number;
}

/**
 * The view that shows a card of `scale` × the rest-fitted image: centred, or,
 * when taller than the rest area, with its top at the top band and moved up by
 * `scrollTop`.
 */
export function cardView(
  restImage: Size,
  restArea: Size,
  scale: number,
  scrollTop: number,
): CardView {
  const overflow = Math.max(0, restImage.height * scale - restArea.height);
  return { scale, y: overflow / 2 - Math.min(scrollTop, overflow) };
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

/**
 * Blend progress of a drag towards a variant: the share of the stage width a
 * slide would have moved.
 */
export function scrubProgress(deltaX: number, stageWidth: number) {
  return Math.min(1, Math.abs(deltaX) / stageWidth);
}

/** Time a released move from `progress` to `target` takes of its full `duration`. */
export function settleDuration(
  duration: number,
  progress: number,
  target: number,
) {
  return duration * Math.abs(target - progress);
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

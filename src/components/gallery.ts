import type { CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n';
import type { Tween } from 'svelte/motion';
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

/** The drawing's view: its scale and its offset from the stage centre. */
export interface View {
  scale: number;
  pan: Point;
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

/**
 * Blend progress of a drag towards a variant: the share of the stage width a
 * slide would have moved.
 */
export function scrubProgress(deltaX: number, stageWidth: number) {
  return Math.min(1, Math.abs(deltaX) / stageWidth);
}

/**
 * Time a move from `progress` to `target` takes of its full `duration`: the
 * share still to go, and never longer than a whole move.
 */
export function settleDuration(
  duration: number,
  progress: number,
  target: number,
) {
  return duration * Math.min(1, Math.abs(target - progress));
}

/** What a strip of slides or a stack of layers shows at a position, if anything. */
export type ImageAt = (position: number) => number | undefined;

/** Whether the slide or layer at `position` is on screen while `onScreen` is. */
function visible(position: number, onScreen: number) {
  return Math.abs(position - onScreen) < 1;
}

/**
 * Where the strip puts the slide for `target` when a change travels
 * `direction` from the slide at `at`, the strip being at `onScreen` (in
 * slides): one slide on, but never past the first one beyond the screen, so a
 * card skipped before it came into view is never shown. A slide on screen
 * keeps its image, so one that holds another is passed over.
 */
export function slidePosition(
  at: number,
  onScreen: number,
  direction: 1 | -1,
  target: number,
  imageAt: ImageAt,
) {
  const beyond =
    direction > 0 ? Math.ceil(onScreen + 1) : Math.floor(onScreen - 1);
  const next =
    direction > 0 ? Math.min(at + 1, beyond) : Math.max(at - 1, beyond);
  return keeps(next, onScreen, target, imageAt) ? beyond : next;
}

/**
 * Where a card puts the layer for `target` when it changes to it from the
 * layer at `at`, its blend being at `onScreen` (in layers): a layer on screen
 * that shows it already, or one layer above `at`, but never past the first
 * one above the screen, so an image skipped before it showed is never
 * blended through. A layer on screen keeps its image, so one that holds
 * another is passed over.
 */
export function layerPosition(
  at: number,
  onScreen: number,
  target: number,
  imageAt: ImageAt,
) {
  const shown = [Math.floor(onScreen), Math.ceil(onScreen)].find(
    (position) =>
      visible(position, onScreen) && imageAt(position) === target,
  );
  return shown ?? slidePosition(at, onScreen, 1, target, imageAt);
}

function keeps(
  position: number,
  onScreen: number,
  target: number,
  imageAt: ImageAt,
) {
  const image = imageAt(position);
  return (
    visible(position, onScreen) && image !== undefined && image !== target
  );
}

export function displayedSwipeOffset(deltaX: number, reducedMotion: boolean) {
  return reducedMotion ? 0 : deltaX;
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

/** CSS's `cubic-bezier(x1, y1, x2, y2)` as an easing of time from 0 to 1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const along = (a: number, b: number, t: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return (time: number) => {
    if (time <= 0 || time >= 1) return time <= 0 ? 0 : 1;
    let [low, high] = [0, 1];
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (along(x1, x2, middle) < time) low = middle;
      else high = middle;
    }
    return along(y1, y2, (low + high) / 2);
  };
}

/** Stops `number` where it is on screen. */
export function stop(number: Tween<number>) {
  number.set(number.current, { duration: 0 });
}

/**
 * Sends `number` to `to` from where it is on screen. A tween times a move
 * from when it is set but starts it from its value at its next frame, which
 * a move still under way would first carry on: it is stopped where it is.
 */
export function moveOn(
  number: Tween<number>,
  to: number,
  options: Parameters<Tween<number>['set']>[1],
) {
  stop(number);
  return number.set(to, options);
}

/**
 * The strip's and the lightbox's opening easing, the card's, and CSS's
 * `ease-out`, for a move sent on while it is under way.
 */
export const STRIP_EASING = cubicBezier(0.22, 1, 0.36, 1);
export const CARD_EASING = cubicBezier(0.45, 0.05, 0.2, 1);
export const EASE_OUT = cubicBezier(0, 0, 0.58, 1);

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the opening puts the card, `open` of the way from a thumbnail's
 * frame to rest: the box between them, the drawing covering it as the
 * thumbnail crops it (at `hover` scale when closed), given as a move and a
 * scale of the stage about its centre and a clip inset in the stage's own
 * untransformed space.
 */
export function morphFrame(
  thumbnail: Rect,
  rest: Size,
  stage: Size,
  open: number,
  hover: number,
) {
  const at = (from: number, to: number) => from + (to - from) * open;
  const width = at(thumbnail.width, rest.width);
  const height = at(thumbnail.height, rest.height);
  const centre = {
    x: at(thumbnail.x + thumbnail.width / 2, stage.width / 2),
    y: at(thumbnail.y + thumbnail.height / 2, stage.height / 2),
  };
  const scale =
    Math.max(width / rest.width, height / rest.height) * at(hover, 1);
  const vertical = stage.height / 2 - height / 2 / scale;
  const horizontal = stage.width / 2 - width / 2 / scale;
  return {
    x: centre.x - stage.width / 2,
    y: centre.y - stage.height / 2,
    scale,
    clip: { top: vertical, right: horizontal, bottom: vertical, left: horizontal },
  };
}

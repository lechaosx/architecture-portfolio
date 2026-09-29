import { clampScale, type Point, type View, type ZoomRange } from './gallery';

/** What the lightbox shows when an input arrives. */
export interface GestureContext {
  view: View;
  range: ZoomRange;
  /** The text side faces the viewer. */
  flipped: boolean;
  /** Opening, closing, or changing image: no gesture starts. */
  busy: boolean;
}

/**
 * What an input asks of the lightbox. Points are relative to the stage centre;
 * a `view` pan is unclamped.
 */
export type GestureIntent =
  /** The input is the lightbox's, so the browser's default action does not run. */
  | { type: 'claim' }
  /** A mouse gesture starts (`grabbing`: the stage captures the pointer until it is released) or ends. */
  | { type: 'grab'; grabbing: boolean }
  | { type: 'view'; scale: number; pan: Point }
  /** Zooms to `scale`, keeping the image point under `point` in place. */
  | { type: 'zoom'; scale: number; point: Point }
  /** A live drag at rest, `offset` px sideways: it moves the strip or scrubs a blend. */
  | { type: 'drag'; offset: number }
  /** A released drag changes image: 1 to the next, −1 to the previous. */
  | { type: 'commit'; direction: 1 | -1 }
  /** A drag at rest ends without changing image. */
  | { type: 'settle' }
  /** A live drag on the text, `offset` px sideways: it turns the card towards its drawing. */
  | { type: 'turn'; offset: number }
  /** A released drag on the text turns the card to its drawing, the way it moved: 1 leftwards, −1 rightwards. */
  | { type: 'turnBack'; direction: 1 | -1 }
  /** A drag on the text ends with the text still up. */
  | { type: 'keepText' }
  /** A pinch takes over: the strip and any scrub return to rest at once. */
  | { type: 'abandon' };

type Input = 'mouse' | 'touch';

type Gesture =
  /** `turns`: a touch that started on the text side, so it turns the card instead of changing image. */
  | { kind: 'swipe'; input: Input; start: Point; delta: Point; turns: boolean }
  | { kind: 'pan'; input: Input; grip: Point }
  | {
      kind: 'pinch';
      input: 'touch';
      distance: number;
      center: Point;
      from: View;
    };

const SWIPE_DISTANCE = 50;
const TAP_SLOP = 10;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 30;
const DOUBLE_TAP_SCALE = 2.5;
const KEY_ZOOM_STEP = 1.25;

/**
 * Turns mouse, touch, wheel, double-click and zoom-key input on the lightbox
 * into intents. It holds at most one live gesture: a drag at rest swipes, one on
 * the text side turns the card, a drag on a zoomed drawing pans, two fingers
 * pinch.
 */
export class LightboxGestures {
  #gesture: Gesture | undefined;
  /** Where a touch that may still become a tap went down. */
  #tap: Point | undefined;
  #lastTap: { point: Point; time: number } | undefined;

  /** On the text side a mouse selects the text, which spans the stage. */
  mouseDown(point: Point, context: GestureContext): GestureIntent[] {
    if (context.busy || context.flipped) return [];
    return [{ type: 'claim' }, ...this.#grab('mouse', point, context)];
  }

  mouseMove(point: Point, context: GestureContext): GestureIntent[] {
    return this.#gesture?.input === 'mouse' ? this.#follow(point, context) : [];
  }

  mouseUp(): GestureIntent[] {
    const gesture = this.#gesture;
    if (gesture?.input !== 'mouse') return [];
    const ended = this.#become(undefined);
    return gesture.kind === 'swipe' ? [...ended, release(gesture)] : ended;
  }

  mouseCancel(): GestureIntent[] {
    return this.#gesture?.input === 'mouse' ? this.#stop() : [];
  }

  touchStart(
    touches: Point[],
    selectingText: boolean,
    context: GestureContext,
  ): GestureIntent[] {
    if (context.busy) return [];
    if (touches.length === 1) {
      this.#tap = context.flipped ? undefined : touches[0];
      if (selectingText && swipes(context)) return this.#become(undefined);
      return this.#grab('touch', touches[0], context);
    }
    if (touches.length === 2 && !context.flipped) {
      this.#tap = undefined;
      return [
        ...this.#become({
          kind: 'pinch',
          input: 'touch',
          distance: distance(touches[0], touches[1]),
          center: midpoint(touches[0], touches[1]),
          from: context.view,
        }),
        { type: 'abandon' },
      ];
    }
    this.#tap = undefined;
    return this.#stop();
  }

  touchMove(
    touches: Point[],
    selectingText: boolean,
    context: GestureContext,
  ): GestureIntent[] {
    const gesture = this.#gesture;
    if (gesture?.kind === 'pinch') {
      if (touches.length !== 2) return [];
      const { from } = gesture;
      const spread =
        gesture.distance > 0
          ? distance(touches[0], touches[1]) / gesture.distance
          : 1;
      const scale = clampScale(from.scale * spread, context.range);
      const ratio = scale / from.scale;
      const center = midpoint(touches[0], touches[1]);
      return [
        { type: 'claim' },
        {
          type: 'view',
          scale,
          pan: {
            x: center.x - ratio * (gesture.center.x - from.pan.x),
            y: center.y - ratio * (gesture.center.y - from.pan.y),
          },
        },
      ];
    }
    if (gesture?.input !== 'touch' || touches.length !== 1) return [];
    if (gesture.kind === 'swipe' && selectingText) return this.#stop();
    return this.#follow(touches[0], context);
  }

  /** `touches` stay down; `changed` have just lifted. */
  touchEnd(
    touches: Point[],
    changed: Point[],
    time: number,
    context: GestureContext,
  ): GestureIntent[] {
    if (this.#doubleTapped(touches, changed, time)) {
      return [
        { type: 'claim' },
        ...this.#stop(),
        { type: 'zoom', scale: doubleTapScale(context), point: changed[0] },
      ];
    }
    const gesture = this.#gesture;
    if (gesture?.kind === 'pinch') {
      return touches.length === 1 && context.view.scale > 1
        ? this.#grab('touch', touches[0], context)
        : this.#become(undefined);
    }
    if (gesture?.input !== 'touch' || touches.length) return [];
    const ended = this.#become(undefined);
    return gesture.kind === 'swipe' ? [...ended, release(gesture)] : ended;
  }

  touchCancel(): GestureIntent[] {
    this.#tap = undefined;
    return this.#gesture?.input === 'touch' ? this.#stop() : [];
  }

  /** The text scrolled natively, so the touch on it is a scroll, not a drag. */
  textScrolled(): GestureIntent[] {
    const gesture = this.#gesture;
    return gesture?.kind === 'swipe' && gesture.input === 'touch'
      ? this.#stop()
      : [];
  }

  /** `deltaY` in pixels. On the text side the wheel scrolls the text. */
  wheel(
    deltaY: number,
    point: Point,
    context: GestureContext,
  ): GestureIntent[] {
    if (context.flipped) return [];
    if (!this.#zoomable(context)) return [{ type: 'claim' }];
    return [
      { type: 'claim' },
      {
        type: 'zoom',
        scale: clampScale(
          context.view.scale * Math.exp(-deltaY * 0.002),
          context.range,
        ),
        point,
      },
    ];
  }

  doubleClick(point: Point, context: GestureContext): GestureIntent[] {
    return context.flipped || !this.#zoomable(context)
      ? []
      : [{ type: 'zoom', scale: doubleTapScale(context), point }];
  }

  /** `in` and `out` step about the centre; `reset` returns to 100%. */
  key(
    action: 'in' | 'out' | 'reset',
    context: GestureContext,
  ): GestureIntent[] {
    if (context.flipped || !this.#zoomable(context)) return [];
    const step = action === 'in' ? KEY_ZOOM_STEP : 1 / KEY_ZOOM_STEP;
    const scale =
      action === 'reset'
        ? 1
        : clampScale(context.view.scale * step, context.range);
    return [{ type: 'claim' }, { type: 'zoom', scale, point: { x: 0, y: 0 } }];
  }

  /** Ends any live gesture: a change of image takes over from it, so a drag does not settle. */
  end(): GestureIntent[] {
    this.#tap = undefined;
    return this.#become(undefined);
  }

  #grab(input: Input, point: Point, context: GestureContext): GestureIntent[] {
    if (swipes(context)) {
      const turns = context.flipped;
      return [
        ...this.#become({
          kind: 'swipe',
          input,
          start: point,
          delta: { x: 0, y: 0 },
          turns,
        }),
        { type: turns ? 'turn' : 'drag', offset: 0 },
      ];
    }
    const { pan } = context.view;
    return this.#become({
      kind: 'pan',
      input,
      grip: { x: point.x - pan.x, y: point.y - pan.y },
    });
  }

  /** Every change of the live gesture goes through here, so a mouse gesture's start and end are always reported. */
  #become(next: Gesture | undefined): GestureIntent[] {
    const wasGrabbing = this.#gesture?.input === 'mouse';
    this.#gesture = next;
    const grabbing = next?.input === 'mouse';
    return grabbing === wasGrabbing ? [] : [{ type: 'grab', grabbing }];
  }

  /**
   * Follows the live mouse or one-finger gesture to `point`. A touch the
   * lightbox follows is claimed: left to the browser, a quick one would also
   * start a fling that `touch-action` then forbids, and Chromium would swallow
   * the next tap as the one that stops that fling.
   */
  #follow(point: Point, context: GestureContext): GestureIntent[] {
    const gesture = this.#gesture;
    const claim: GestureIntent[] =
      gesture?.input === 'touch' ? [{ type: 'claim' }] : [];
    if (gesture?.kind === 'pan') {
      return [
        ...claim,
        {
          type: 'view',
          scale: context.view.scale,
          pan: { x: point.x - gesture.grip.x, y: point.y - gesture.grip.y },
        },
      ];
    }
    if (gesture?.kind !== 'swipe') return [];
    const delta = {
      x: point.x - gesture.start.x,
      y: point.y - gesture.start.y,
    };
    gesture.delta = delta;
    const type = gesture.turns ? 'turn' : 'drag';
    // On the text a mostly vertical touch may still become a native scroll.
    if (gesture.turns && Math.abs(delta.x) <= Math.abs(delta.y)) {
      return [{ type, offset: 0 }];
    }
    return [...claim, { type, offset: delta.x }];
  }

  /** Ends the live gesture and any pending tap; a drag at rest settles, one on the text keeps it up. */
  #stop(): GestureIntent[] {
    const gesture = this.#gesture;
    this.#tap = undefined;
    const ended = this.#become(undefined);
    if (gesture?.kind !== 'swipe') return ended;
    return [...ended, { type: gesture.turns ? 'keepText' : 'settle' }];
  }

  #zoomable(context: GestureContext) {
    return !context.busy && this.#gesture?.kind !== 'swipe';
  }

  #doubleTapped(touches: Point[], changed: Point[], time: number) {
    const start = this.#tap;
    if (!start || touches.length || changed.length !== 1) return false;
    this.#tap = undefined;
    const point = changed[0];
    if (distance(start, point) >= TAP_SLOP) return false;
    const previous = this.#lastTap;
    const double =
      previous !== undefined &&
      time - previous.time < DOUBLE_TAP_DELAY &&
      distance(previous.point, point) < DOUBLE_TAP_DISTANCE;
    this.#lastTap = double ? undefined : { point, time };
    return double;
  }
}

/** At rest a drag changes image, and on the text side at any zoom it turns the card, instead of panning. */
function swipes(context: GestureContext) {
  return context.view.scale <= 1 || context.flipped;
}

function release({ delta, turns }: { delta: Point; turns: boolean }): GestureIntent {
  if (
    Math.abs(delta.x) < SWIPE_DISTANCE ||
    Math.abs(delta.x) <= Math.abs(delta.y)
  ) {
    return { type: turns ? 'keepText' : 'settle' };
  }
  const direction = delta.x < 0 ? 1 : -1;
  return { type: turns ? 'turnBack' : 'commit', direction };
}

function doubleTapScale({ view, range }: GestureContext) {
  return view.scale === 1 ? Math.min(DOUBLE_TAP_SCALE, range.max) : 1;
}

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

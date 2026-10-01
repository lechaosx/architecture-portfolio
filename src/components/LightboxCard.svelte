<script lang="ts" module>
  import type { Size } from './gallery';

  /** One image as the card shows it, whatever the view. */
  export interface CardImage {
    /** Its position in the lightbox. */
    index: number;
    /** The deep-zoom pyramid a tiled drawing draws over its preview. */
    tiles: string | undefined;
    /** Intrinsic size attributes, reserving the image's shape before it loads. */
    width: number | undefined;
    height: number | undefined;
    /** The drawing's size at 100%, once known. */
    size: Size | undefined;
    title: string | undefined;
    description: string | undefined;
  }

  /** A card has a back when its image has a description; the back takes the drawing's size at 100%. */
  export function hasBack(
    image: CardImage,
  ): image is CardImage & { description: string; size: Size } {
    return Boolean(image.description && image.size);
  }
</script>

<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import type { Lang } from '../i18n';
  import {
    CARD_EASING,
    EASE_OUT,
    cardView,
    layerPosition,
    moveOn,
    scrubProgress,
    settleDuration,
    type View,
  } from './gallery';
  import LightboxVerso from './LightboxVerso.svelte';

  // An image as a card: its drawing on the front and, when it has a
  // description, its text on the back. The card owns how it looks while it
  // changes: every image it shows is a layer over the ones before, and it
  // chases three numbers, the blend (which layer is up), the turn (which side
  // is up) and the view, from wherever they are on screen towards what its
  // props ask for.
  let {
    image,
    describe,
    source,
    towards,
    textUp,
    variants,
    drag,
    view,
    viewDuration,
    moving,
    restArea,
    columnLimit,
    lang,
    tiledCanvas,
    drawing = $bindable(),
    turn = $bindable(),
    ready = $bindable(),
    onload,
  }: {
    /** The image the card is on; another one blends in over it. */
    image: number;
    describe: (index: number) => CardImage;
    /** An image's drawing at a view. */
    source: (index: number, view: View) => string | undefined;
    /** The way the latest change goes, 1 the next way: a turn it starts at rest rotates that way. */
    towards: 1 | -1;
    /** The image's text side is up. */
    textUp: boolean;
    /** The images a drag at rest blends to either way; none where it moves the strip instead. */
    variants: { previous?: number; next?: number };
    /** A live drag, `offset` px sideways from where it went down; one on the text (`turns`) turns the card. */
    drag: { offset: number; turns: boolean } | undefined;
    /** The drawing's view. */
    view: View;
    /** How long the shown view takes to follow a change of `view`. */
    viewDuration: number;
    /** The card itself is moving (the strip, or the lightbox opening). */
    moving: boolean;
    restArea: Size;
    columnLimit: number;
    lang: Lang;
    /**
     * Draws a deep-zoom pyramid's tiles over its preview, at a view; the flag
     * says the card is at rest on it now.
     */
    tiledCanvas: Snippet<[string, Size | undefined, View, boolean]>;
    /** The drawing of the image the card is on. */
    drawing?: HTMLImageElement;
    /** The card's turn on screen, 1 text side up, for what moves with it. */
    turn?: number;
    /** The drawing of the image the card is on has loaded. */
    ready?: boolean;
    /** Called with the drawing of the image the card is on once it loads. */
    onload?: (drawing: HTMLImageElement) => void;
  } = $props();

  const BLEND_DURATION = 180;
  // A whole turn; with reduced motion the faces only crossfade.
  const TURN_DURATION = 560;
  const CROSSFADE_DURATION = 150;

  interface Layer {
    /** Layers stack upwards by position; the blend is fully on one at its position. */
    position: number;
    image: number;
    /** Its drawing has loaded, so the blend may move to it. */
    ready: boolean;
    /**
     * The card has come to rest on it on screen, so a tiled drawing draws
     * its tiles; until then it shows its preview, as creating the tiled
     * canvas mid-move would stall the move.
     */
    rested: boolean;
    /** Measured by its back. */
    cardScale: number;
    /** Its back's reading position. */
    scroll: number;
    drawing?: HTMLImageElement;
  }

  let layers = $state<Layer[]>(untrack(() => [newLayer(0, image)]));
  let at = $state(0);
  const mix = new Tween(0, { easing: CARD_EASING });
  const turning = new Tween(untrack(() => (textUp ? 1 : 0)), { easing: CARD_EASING });
  const shownView = new Tween(untrack(() => view), { easing: CARD_EASING });
  // The way the card turns, 1 turning back to its drawing leftwards.
  let direction = $state(untrack(() => towards));
  // What was on screen when the live drag began: the blend, and the turn as
  // a signed share of the way back to the drawing (positive leftwards).
  let grab: { mix: number; back: number } | undefined;
  let current = $derived(layers.find((layer) => layer.position === at)!);
  // The back's view the turn moves the drawing to and from: each layer's, by
  // its share of what shows.
  let back = $derived(
    layers.reduce(
      (sum, layer) => {
        const share = shows(layer);
        const { scale, y } = backView(layer);
        return { scale: sum.scale + share * scale, y: sum.y + share * y };
      },
      { scale: 0, y: 0 },
    ),
  );
  let wasTextUp = untrack(() => textUp);

  $effect(() => {
    drawing = current.drawing;
  });

  $effect.pre(() => {
    turn = turning.current;
    ready = current.ready;
  });

  $effect.pre(() => {
    const next = view;
    const duration = viewDuration;
    untrack(() => shownView.set(next, { duration }));
  });

  // The back starts at the top whenever it turns up.
  $effect.pre(() => {
    const up = textUp;
    if (up && !wasTextUp) untrack(() => (current.scroll = 0));
    wasTextUp = up;
  });

  // Another image is layered over what is on screen.
  $effect.pre(() => {
    const target = image;
    untrack(() => {
      if (current.image === target) return;
      at = layerFor(target, mix.current, true).position;
    });
  });

  $effect.pre(() => {
    const target = targets();
    if (target) untrack(() => chase(target));
  });

  // At rest on screen: the blend has reached the current layer, and nothing
  // drags or carries the card.
  let resting = $derived(mix.current === at && !drag && current.ready && !moving);

  // Once the blend rests on the image it moved to, the layers it covers go,
  // and once the card rests too, its tiles may start.
  $effect.pre(() => {
    if (mix.current !== at || drag || !current.ready) return;
    const still = resting;
    untrack(() => {
      if (layers.length > 1) layers = [current];
      if (still) current.rested = true;
    });
  });

  function newLayer(position: number, index: number): Layer {
    return {
      position,
      image: index,
      ready: false,
      rested: false,
      cardScale: 1,
      scroll: 0,
    };
  }

  /**
   * The layer that shows `target` over a blend at `onScreen`: one on screen
   * that shows it, or one layered in just above what is on screen. Changing
   * to it (`covering`), the layers no longer on screen go.
   */
  function layerFor(target: number, onScreen: number, covering: boolean) {
    const position = layerPosition(at, onScreen, target, imageAt);
    const kept = layerAt(position);
    if (kept?.image === target && !covering) return kept;
    const layer = kept?.image === target ? kept : newLayer(position, target);
    layers = [
      ...layers.filter(
        (other) =>
          other !== kept &&
          (!covering || Math.abs(other.position - onScreen) < 1),
      ),
      layer,
    ].sort((first, second) => first.position - second.position);
    return layer;
  }

  function key(layer: Layer) {
    return `${layer.position}:${layer.image}`;
  }

  function layerAt(position: number) {
    return layers.find((layer) => layer.position === position);
  }

  function imageAt(position: number) {
    return layerAt(position)?.image;
  }

  /**
   * Where the card moves to: its image and side, or where a live drag has
   * taken them from what it grabbed. Nothing while the image it moves to is
   * still loading, so it goes on as it was and never blends to nothing.
   */
  function targets():
    | { mix: number; turn: number; direction?: 1 | -1; follows: boolean }
    | undefined {
    if (!drag || prefersReducedMotion.current) {
      grab = undefined;
      return current.ready
        ? { mix: at, turn: textUp ? 1 : 0, follows: false }
        : undefined;
    }
    const { offset, turns } = drag;
    grab ??= untrack(() => ({
      mix: mix.current,
      back: (1 - turning.current) * direction,
    }));
    if (turns) {
      const back = Math.max(-1, Math.min(1, grab.back - offset / restArea.width));
      return {
        mix: untrack(() => mix.target),
        turn: 1 - Math.abs(back),
        direction: back > 0 ? 1 : back < 0 ? -1 : undefined,
        follows: true,
      };
    }
    const turn = untrack(() => turning.target);
    const variant =
      offset < 0 ? variants.next : offset > 0 ? variants.previous : undefined;
    if (variant === undefined) return { mix: grab.mix, turn, follows: true };
    const layer = layerFor(variant, grab.mix, false);
    if (!layer.ready) return { mix: grab.mix, turn, follows: true };
    const share = scrubProgress(offset, restArea.width);
    return {
      mix:
        layer.position > grab.mix
          ? Math.min(grab.mix + share, layer.position)
          : Math.max(grab.mix - share, layer.position),
      turn,
      follows: true,
    };
  }

  /**
   * Moves on from what is on screen. A whole blend or turn takes its full
   * time and a part of one its share; a blend that turns the card takes the
   * turn's time, and both take the same, so edge-on is halfway through both.
   * The way it turns changes only while the card rests on a side, where
   * either way draws the same card.
   */
  function chase(target: {
    mix: number;
    turn: number;
    direction?: 1 | -1;
    follows: boolean;
  }) {
    const resting = turning.current === 0 || turning.current === 1;
    direction = target.direction ?? (resting ? towards : direction);
    const turns = target.turn !== turning.target;
    const blends = target.mix !== mix.target;
    if (!turns && !blends) return;
    const full = prefersReducedMotion.current ? CROSSFADE_DURATION : TURN_DURATION;
    const duration = target.follows
      ? 0
      : Math.max(
          turns ? settleDuration(full, turning.current, target.turn) : 0,
          blends
            ? settleDuration(turns ? full : BLEND_DURATION, mix.current, target.mix)
            : 0,
        );
    // A move sent elsewhere while it is under way goes on at speed rather
    // than easing in again from standing.
    const easing = (number: Tween<number>) =>
      number.current === number.target ? CARD_EASING : EASE_OUT;
    if (turns) moveOn(turning, target.turn, { duration, easing: easing(turning) });
    if (blends) {
      moveOn(mix, target.mix, {
        duration: prefersReducedMotion.current ? 0 : duration,
        easing: easing(mix),
      });
    }
  }

  function loaded(layer: Layer, drawing: HTMLImageElement) {
    layer.ready = true;
    if (layer === current) onload?.(drawing);
  }

  /** A drawing already loaded is complete as it enters the page. */
  function whenLoaded(layer: Layer) {
    return (drawing: HTMLImageElement) => {
      if (drawing.complete && drawing.naturalWidth > 0) untrack(() => loaded(layer, drawing));
    };
  }

  /** How much of a layer the blend on screen shows before the ones above it. */
  function reach(position: number) {
    return Math.min(1, Math.max(0, mix.current + 1 - position));
  }

  /**
   * How much of a layer shows through the layers above it that `cover` it:
   * on the front every one does; on the back only one with a back of its
   * own, as one without leaves the backs beneath uncovered where it fades.
   */
  function shows(layer: Layer, covers = (_above: Layer) => true) {
    return layers
      .filter((above) => above.position > layer.position && covers(above))
      .reduce((share, above) => share * (1 - reach(above.position)), reach(layer.position));
  }

  /** Where a layer's back shows its card; a layer without a back rests. */
  function backView(layer: Layer) {
    const card = describe(layer.image);
    return hasBack(card)
      ? cardView(card.size, restArea, layer.cardScale, layer.scroll)
      : { scale: 1, y: 0 };
  }
</script>

<div
  data-lightbox-sheet
  class="lightbox-sheet absolute inset-0"
  style:--lightbox-turn={turning.current}
  style:--lightbox-side={turning.target}
  style:--lightbox-turn-direction={direction}
  style:--drawing-scale={view.scale}
  style:--drawing-x={`${view.pan.x}px`}
  style:--drawing-y={`${view.pan.y}px`}
  style:--lightbox-view-scale={shownView.current.scale}
  style:--lightbox-view-x={`${shownView.current.pan.x}px`}
  style:--lightbox-view-y={`${shownView.current.pan.y}px`}
  style:--back-scale={back.scale}
  style:--back-y={`${back.y}px`}
>
  <div
    class={[
      'lightbox-front lightbox-face flex items-center justify-center',
      { 'lightbox-away': turning.current === 1 },
    ]}
    inert={textUp}
  >
    {#each layers as layer, order (key(layer))}
      {@const card = describe(layer.image)}
      <img
        bind:this={layer.drawing}
        {@attach whenLoaded(layer)}
        src={source(layer.image, view)}
        width={card.width}
        height={card.height}
        alt=""
        draggable="false"
        style:width={card.size ? `${card.size.width}px` : undefined}
        style:height={card.size ? `${card.size.height}px` : undefined}
        style:opacity={reach(layer.position)}
        class={[
          'lightbox-at-view absolute size-auto max-h-full max-w-full object-contain select-none',
          { 'lightbox-incoming': order > 0 },
        ]}
        onload={() => loaded(layer, layer.drawing!)}
        onerror={() => (layer.ready = true)}
      />
      {#if card.tiles && layer.rested}
        <div
          class="lightbox-from-drawing absolute inset-0"
          style:opacity={reach(layer.position)}
        >
          {@render tiledCanvas(card.tiles, card.size, view, layer === current && resting)}
        </div>
      {/if}
    {/each}
  </div>
  {#if layers.some((layer) => hasBack(describe(layer.image)))}
    <div
      class={['lightbox-back lightbox-face', { 'lightbox-away': turning.current === 0 }]}
      inert={!textUp}
    >
      {#each layers as layer, order (key(layer))}
        {@const card = describe(layer.image)}
        {#if hasBack(card)}
          {@const view = backView(layer)}
          <div
            class={['absolute inset-0', { 'lightbox-incoming': order > 0 }]}
            style:opacity={shows(layer, (above) => !hasBack(describe(above.image)))}
            style:--card-scale={view.scale}
            style:--card-y={`${view.y}px`}
            inert={layer !== current}
          >
            <LightboxVerso
              title={card.title}
              description={card.description}
              {lang}
              restImage={card.size}
              {columnLimit}
              bind:cardScale={layer.cardScale}
              bind:scrollTop={layer.scroll}
            />
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Three numbers move the card, each chased by a tween in the script from
     its value on screen: --lightbox-turn, 1 with the text side up and 0 with
     the drawing up; the blend, at which each layer is fully shown once it is
     reached; and the shown view, the drawing's view (--lightbox-view-*)
     that the turn turns towards the back's card view, so a flip also zooms
     between them. --lightbox-turn-direction sets which way it rotates. The
     front face and each back's card turn themselves, about the stage's
     vertical centre line under one perspective, so a card's scroll container
     stays in screen space and clips it only to the screen, less any
     scrollbar gutters. The sheet keeps a 3D context because Chromium hides
     the turned-away front's drawing only within one. */
  .lightbox-sheet {
    --lightbox-shown-turn: var(--lightbox-turn);
    --shown-scale: calc(
      var(--lightbox-view-scale) +
        (var(--back-scale) - var(--lightbox-view-scale)) *
        var(--lightbox-shown-turn)
    );
    --shown-x: calc(var(--lightbox-view-x) * (1 - var(--lightbox-shown-turn)));
    --shown-y: calc(
      var(--lightbox-view-y) +
        (var(--back-y) - var(--lightbox-view-y)) * var(--lightbox-shown-turn)
    );
    transform-style: preserve-3d;
  }

  .lightbox-front {
    transform: rotateY(var(--lightbox-front-angle, 0deg));
  }

  .lightbox-at-view {
    transform: translate3d(var(--shown-x), var(--shown-y), 0)
      scale(var(--shown-scale));
  }

  /* The tiled canvas is laid out at the drawing's view, not the one shown,
     and carried to the shown view; each back's card is carried the same way
     inside LightboxVerso. */
  .lightbox-from-drawing {
    transform: translate(var(--shown-x), var(--shown-y))
      scale(calc(var(--shown-scale) / var(--drawing-scale)))
      translate(calc(-1 * var(--drawing-x)), calc(-1 * var(--drawing-y)));
  }

  .lightbox-face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
  }

  /* The face turned away is hidden once the turn ends, so it is neither drawn
     nor hit-tested. */
  .lightbox-away {
    visibility: hidden;
  }

  @media (prefers-reduced-motion: no-preference) {
    .lightbox-sheet {
      --lightbox-perspective: 2400px;
      --lightbox-front-angle: calc(
        var(--lightbox-turn) * var(--lightbox-turn-direction) * 180deg
      );
      --lightbox-back-angle: calc(
        (var(--lightbox-turn) - 1) * var(--lightbox-turn-direction) * 180deg
      );
      /* 1 once the back faces the viewer, else 0. */
      --lightbox-back-facing: round(var(--lightbox-turn), 1);
      perspective: var(--lightbox-perspective);
    }
  }

  /* With reduced motion nothing turns: the turn crossfades the faces, and
     the view changes at once to the side it goes to. */
  @media (prefers-reduced-motion: reduce) {
    .lightbox-sheet {
      --lightbox-shown-turn: var(--lightbox-side);
    }

    .lightbox-front {
      opacity: calc(1 - var(--lightbox-turn));
    }

    .lightbox-back {
      opacity: var(--lightbox-turn);
    }
  }
</style>

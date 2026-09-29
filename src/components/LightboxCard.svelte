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
  import type { Snippet } from 'svelte';
  import type { Lang } from '../i18n';
  import { cardView, type View } from './gallery';
  import LightboxVerso from './LightboxVerso.svelte';

  // The current image as a card: its drawing on the front and, when it has a
  // description, its text on the back. During a move to a variant, `incoming`
  // shows over both faces by `blend`.
  let {
    current,
    currentSrc,
    incoming,
    incomingSrc,
    blend,
    flipped,
    view,
    duration,
    restArea,
    columnLimit,
    lang,
    tiledCanvas,
    scrollTop = $bindable(0),
    image = $bindable(),
    onload,
  }: {
    current: CardImage;
    /** The drawing's source, which depends on the view. */
    currentSrc: string | undefined;
    incoming: CardImage | undefined;
    incomingSrc: string | undefined;
    blend: number;
    /** The text side faces the viewer. */
    flipped: boolean;
    /** The drawing's view. */
    view: View;
    /** How long the next turn or blend takes; 0 moves the card at once. */
    duration: number;
    restArea: Size;
    columnLimit: number;
    lang: Lang;
    /** Draws a deep-zoom pyramid's tiles over the preview. */
    tiledCanvas: Snippet<[string]>;
    /** The back's reading position. */
    scrollTop?: number;
    image?: HTMLImageElement;
    onload: () => void;
  } = $props();

  // Measured by the backs.
  let cardScale = $state(1);
  let incomingCardScale = $state(1);
  // 1 shows the text side, 0 the drawing; a move to a variant from the text
  // side turns the card back as it blends.
  let turn = $derived(flipped ? 1 - blend : 0);
  // Where the back shows its card; the flip moves the drawing to and from it.
  let backView = $derived(
    hasBack(current)
      ? cardView(current.size, restArea, cardScale, scrollTop)
      : { scale: 1, y: 0 },
  );
</script>

<div
  data-lightbox-sheet
  class="lightbox-sheet absolute inset-0"
  style:--lightbox-card-duration={`${duration}ms`}
  style:--lightbox-turn={turn}
  style:--lightbox-blend={blend}
  style:--drawing-scale={view.scale}
  style:--drawing-x={`${view.pan.x}px`}
  style:--drawing-y={`${view.pan.y}px`}
  style:--card-scale={backView.scale}
  style:--card-y={`${backView.y}px`}
>
  <div
    class="lightbox-front lightbox-face flex items-center justify-center"
    class:lightbox-away={turn === 1}
    inert={flipped}
  >
    <img
      bind:this={image}
      src={currentSrc}
      width={current.width}
      height={current.height}
      alt=""
      draggable="false"
      style:width={current.size ? `${current.size.width}px` : undefined}
      style:height={current.size ? `${current.size.height}px` : undefined}
      class:absolute={Boolean(current.tiles)}
      class:lightbox-image={view.scale === 1}
      class="lightbox-at-view h-auto max-h-full w-auto max-w-full object-contain select-none"
      {onload}
    />
    {#if current.tiles}
      <div class="lightbox-from-drawing absolute inset-0">
        {@render tiledCanvas(current.tiles)}
      </div>
    {/if}
    {#if incoming}
      <!-- Unbacked: until the variant has loaded, the current drawing shows
           through undimmed. -->
      <div
        class="lightbox-incoming absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <img
          src={incomingSrc}
          width={incoming.width}
          height={incoming.height}
          alt=""
          draggable="false"
          style:width={incoming.size ? `${incoming.size.width}px` : undefined}
          style:height={incoming.size ? `${incoming.size.height}px` : undefined}
          class="lightbox-at-view h-auto max-h-full w-auto max-w-full object-contain select-none"
        />
      </div>
    {/if}
  </div>
  {#if hasBack(current)}
    <div
      class="lightbox-back lightbox-face"
      class:lightbox-away={turn === 0}
      inert={!flipped}
    >
      <div
        class="absolute inset-0"
        class:lightbox-outgoing={incoming && !incoming.description}
      >
        {#key current.index}
          <LightboxVerso
            title={current.title}
            description={current.description}
            {lang}
            restImage={current.size}
            {columnLimit}
            bind:cardScale
            bind:scrollTop
          />
        {/key}
      </div>
      {#if incoming && hasBack(incoming)}
        {@const incomingView = cardView(incoming.size, restArea, incomingCardScale, 0)}
        <div
          class="lightbox-incoming absolute inset-0"
          style:--card-scale={incomingView.scale}
          style:--card-y={`${incomingView.y}px`}
          aria-hidden="true"
          inert
        >
          <LightboxVerso
            title={incoming.title}
            description={incoming.description}
            {lang}
            restImage={incoming.size}
            {columnLimit}
            bind:cardScale={incomingCardScale}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* --lightbox-turn is 1 with the text side up and 0 with the drawing up; the
     card turns by it, and every face is drawn at the shown view between the
     drawing's view and the back's card view, so a flip also zooms between
     them. --lightbox-blend shows a variant over both faces. Turn and blend
     share one duration and easing, so they stay in step.
     The front face and each back's card turn themselves, about the stage's
     vertical centre line under one perspective, so a card's scroll container
     stays in screen space and clips it only to the screen, less any scrollbar
     gutters. The sheet keeps a 3D context because Chromium hides the
     turned-away front's drawing only within one. */
  @property --lightbox-turn {
    syntax: '<number>';
    inherits: true;
    initial-value: 0;
  }

  .lightbox-sheet {
    --lightbox-card-easing: cubic-bezier(0.45, 0.05, 0.2, 1);
    --shown-scale: calc(
      var(--drawing-scale) +
        (var(--card-scale) - var(--drawing-scale)) * var(--lightbox-turn)
    );
    --shown-x: calc(var(--drawing-x) * (1 - var(--lightbox-turn)));
    --shown-y: calc(
      var(--drawing-y) + (var(--card-y) - var(--drawing-y)) * var(--lightbox-turn)
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

  /* The tiled canvas stays laid out at the drawing's view and is carried to
     the shown view; each back's card is carried the same way inside
     LightboxVerso. */
  .lightbox-from-drawing {
    transform: translate(var(--shown-x), var(--shown-y))
      scale(calc(var(--shown-scale) / var(--drawing-scale)))
      translate(calc(-1 * var(--drawing-x)), calc(-1 * var(--drawing-y)));
  }

  .lightbox-face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    transition:
      opacity var(--lightbox-card-duration),
      visibility 0s;
  }

  /* The face turned away is hidden once the turn ends, so it is neither drawn
     nor hit-tested. */
  .lightbox-away {
    visibility: hidden;
    transition-delay: 0s, var(--lightbox-card-duration);
  }

  .lightbox-incoming,
  .lightbox-outgoing {
    transition: opacity var(--lightbox-card-duration) var(--lightbox-card-easing);
  }

  .lightbox-incoming {
    opacity: var(--lightbox-blend);
  }

  /* A back whose variant has no description fades to nothing. */
  .lightbox-outgoing {
    opacity: calc(1 - var(--lightbox-blend));
  }

  /* A blend that starts animated fades in from nothing. */
  @starting-style {
    .lightbox-incoming {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .lightbox-sheet {
      --lightbox-perspective: 2400px;
      --lightbox-front-angle: calc(var(--lightbox-turn) * 180deg);
      --lightbox-back-angle: calc((var(--lightbox-turn) - 1) * 180deg);
      /* 1 once the back faces the viewer, else 0. */
      --lightbox-back-facing: round(var(--lightbox-turn), 1);
      perspective: var(--lightbox-perspective);
      transition: --lightbox-turn var(--lightbox-card-duration)
        var(--lightbox-card-easing);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lightbox-away {
      opacity: 0;
    }
  }
</style>

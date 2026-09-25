<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { ui, type Lang } from '../i18n';
  import { cardColumn, cardScale as fitCard, type Size } from './gallery';

  // The back of a lightbox image's card: the page's surface in the image's
  // shape, grown until its title and description fit, scrolled as a whole.
  let {
    title,
    description,
    lang,
    restImage,
    columnLimit,
    cardScale = $bindable(1),
    scrollTop = $bindable(0),
  }: {
    title: string | undefined;
    description: string;
    lang: Lang;
    restImage: Size;
    columnLimit: number;
    cardScale?: number;
    scrollTop?: number;
  } = $props();

  let scroller = $state<HTMLDivElement>()!;
  let viewHeight = $state(0);
  let probe = $state<HTMLDivElement>()!;
  let fontLoads = $state(0);
  let cardWidth = $derived(restImage.width * cardScale);
  let column = $derived(cardColumn(cardWidth, columnLimit));

  // A face that finishes loading later (a subset first needed by the other
  // language) changes the text's size.
  onMount(() => {
    const remeasure = () => (fontLoads += 1);
    void document.fonts.ready.then(remeasure);
    document.fonts.addEventListener('loadingdone', remeasure);
    return () => document.fonts.removeEventListener('loadingdone', remeasure);
  });

  // Sized once per text, language, image, viewport and loaded font; a resize
  // keeps the reading position in proportion.
  $effect(() => {
    void [title, description, lang, fontLoads];
    const image = restImage;
    const limit = columnLimit;
    untrack(() => {
      const range = scroller.scrollHeight - scroller.clientHeight;
      const position = range > 0 ? scroller.scrollTop / range : 0;
      cardScale = fitCard(image, limit, (width) => {
        probe.style.width = `${width}px`;
        return probe.offsetHeight;
      });
      void tick().then(() => {
        scrollTop =
          position * Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      });
    });
  });

  $effect(() => {
    if (Math.abs(scroller.scrollTop - scrollTop) >= 1) {
      scroller.scrollTop = scrollTop;
    }
  });
</script>

{#snippet text()}
  {#if title}
    <h2 class="mb-3 text-2xl leading-tight sm:mb-4 sm:text-3xl">{title}</h2>
  {/if}
  <p class="text-base leading-relaxed text-justify hyphens-auto">
    {description}
  </p>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrolling region needs focus to scroll by keyboard) -->
<div
  bind:this={scroller}
  bind:clientHeight={viewHeight}
  class="lightbox-verso absolute inset-0 cursor-auto touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
  role="region"
  aria-label={title ?? ui[lang].description}
  tabindex="0"
  {lang}
  data-lightbox-scroll
  onscroll={() => (scrollTop = scroller.scrollTop)}
>
  <!-- The bands are the scroll's padding, so no control covers the text at
       either end. -->
  <!-- Clipped, so a card carried larger mid-turn never grows the scroll; its
       perspective is seen from the middle of the screen, as the front's is. -->
  <div
    class="lightbox-verso-page flex min-h-full items-center justify-center overflow-clip py-(--lightbox-band)"
    style:perspective-origin={`50% ${scrollTop + viewHeight / 2}px`}
  >
    <div
      class="lightbox-card flex shrink-0 items-center justify-center bg-(--page-surface) text-(--page-text)"
      style:width={`${cardWidth}px`}
      style:height={`${restImage.height * cardScale}px`}
    >
      <article style:width={`${column}px`}>{@render text()}</article>
    </div>
  </div>
</div>
<!-- Measures the text at a column width, outside the scroll. -->
<div
  class="invisible absolute top-0 left-0 h-0 overflow-hidden"
  {lang}
  aria-hidden="true"
>
  <div bind:this={probe}>{@render text()}</div>
</div>

<style>
  /* The card is laid out at its own view (the lightbox's --card-scale and
     --card-y), carried to the lightbox's shown view like the drawing on the
     front, and turned last by the back's angle. Seen from behind the front,
     x runs mirrored, so the carry moves the other way across. */
  .lightbox-card {
    transform: rotateY(var(--lightbox-back-angle, 0deg))
      translate(calc(-1 * var(--shown-x)), calc(var(--shown-y) - var(--card-y)))
      scale(calc(var(--shown-scale) / var(--card-scale)));
  }

  /* Gutters on both sides keep a card wider than the screen centred on it.
     The back, its scrollbar included, shows only while it faces the viewer:
     the scroller stays flat on the screen, so nothing else hides its
     scrollbar over the drawing. */
  .lightbox-verso {
    opacity: var(--lightbox-back-facing, 1);
    scrollbar-gutter: stable both-edges;
  }

  .lightbox-verso-page {
    perspective: var(--lightbox-perspective, none);
  }

  .lightbox-verso:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -2px;
  }
</style>

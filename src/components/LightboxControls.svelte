<script lang="ts">
  import { untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { ui, type Lang } from '../i18n';

  // The lightbox's corner controls: the set strip and close button along the
  // top, the edge arrows, the description toggle, and the language switch and
  // original link. They lie over the stage, outside the card, so nothing the
  // card does moves or disables them.
  let {
    lang,
    setOptions,
    currentIndex,
    count,
    originalSrc,
    hasBack,
    flipped,
    arrowsAside,
    closeButton = $bindable(),
    onselect,
    onprevious,
    onnext,
    onclose,
    ontoggle,
  }: {
    lang: Lang;
    /** The set strip's images; empty for no strip. */
    setOptions: { index: number; label: string }[];
    currentIndex: number;
    count: number;
    originalSrc: string | undefined;
    hasBack: boolean;
    flipped: boolean;
    /** How far the edge arrows step aside, 1 fully: on a phone they make way for the text. */
    arrowsAside: number;
    closeButton?: HTMLButtonElement;
    onselect: (index: number) => void;
    onprevious: () => void;
    onnext: () => void;
    onclose: () => void;
    ontoggle: () => void;
  } = $props();

  let setStrip = $state<HTMLElement>();

  // Centres the current image's button whenever the selection or the labels
  // change, since a language switch changes their widths.
  $effect(() => {
    const nav = setStrip;
    const selectedIndex = currentIndex;
    if (!nav || !setOptions.some(({ index }) => index === selectedIndex)) return;
    const selected = nav.querySelector<HTMLElement>('[aria-current="true"]');
    if (!selected) return;
    nav.scrollTo({
      left: selected.offsetLeft - (nav.clientWidth - selected.offsetWidth) / 2,
      behavior: untrack(() => (prefersReducedMotion.current ? 'auto' : 'smooth')),
    });
  });

  function onSetStripWheel(event: WheelEvent) {
    const navigation = event.currentTarget as HTMLElement;
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    event.preventDefault();
    event.stopPropagation();
    navigation.scrollLeft += delta;
  }
</script>

<div
  class="pointer-events-none absolute inset-x-(--lightbox-gap) top-(--lightbox-gap) flex items-start gap-2 *:pointer-events-auto"
>
  {#if setOptions.length}
    <nav
      bind:this={setStrip}
      aria-label={ui[lang].imageSet}
      class="no-scrollbar relative -m-1 min-w-0 touch-pan-x overflow-x-auto p-1"
      data-lightbox-scroll
      onwheel={onSetStripWheel}
    >
      <div class="flex w-max">
        {#each setOptions as { index, label }}
          <button
            type="button"
            class="lightbox-control lightbox-set-option px-3 text-sm"
            aria-current={index === currentIndex ? 'true' : undefined}
            disabled={index === currentIndex}
            onclick={() => onselect(index)}
          >
            {label}
          </button>
        {/each}
      </div>
    </nav>
  {/if}
  <button
    bind:this={closeButton}
    type="button"
    class="lightbox-control ml-auto text-2xl leading-none"
    onclick={onclose}
    aria-label={ui[lang].close}>×</button
  >
</div>
<button
  type="button"
  class={[
    'lightbox-control lightbox-arrow lightbox-arrow-previous left-(--lightbox-gap)',
    { 'lightbox-arrow-away': arrowsAside === 1 },
  ]}
  style:--lightbox-arrows-aside={arrowsAside}
  inert={arrowsAside > 0}
  onclick={onprevious}
  aria-label={ui[lang].previousImage}
>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    class="size-5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <path d="M15.5 5l-7 7 7 7" />
  </svg>
</button>
<button
  type="button"
  class={[
    'lightbox-control lightbox-arrow right-(--lightbox-gap)',
    { 'lightbox-arrow-away': arrowsAside === 1 },
  ]}
  style:--lightbox-arrows-aside={arrowsAside}
  inert={arrowsAside > 0}
  onclick={onnext}
  aria-label={ui[lang].nextImage}
>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    class="size-5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <path d="M8.5 5l7 7-7 7" />
  </svg>
</button>
{#if hasBack}
  <button
    type="button"
    class="lightbox-control absolute bottom-(--lightbox-gap) left-(--lightbox-gap)"
    aria-pressed={flipped}
    aria-label={ui[lang].showDescription}
    onclick={ontoggle}
  >
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      class="size-5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      {#if flipped}
        <rect x="3.5" y="4.5" width="17" height="15" />
        <path d="M3.5 16l5-5 4 4 3-3 5 5" />
      {:else}
        <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />
      {/if}
    </svg>
  </button>
{/if}
<div class="absolute right-(--lightbox-gap) bottom-(--lightbox-gap) flex gap-2">
  <button type="button" data-lang-toggle class="lightbox-control">
    <span class="relative block h-4 w-6 text-xs leading-4 tracking-wider">
      <span class="language-option-cs absolute inset-0" aria-hidden="true"
        >CZ</span
      >
      <span class="language-option-en absolute inset-0" aria-hidden="true"
        >EN</span
      >
    </span>
    <span lang="cs" class="sr-only">{ui.cs.switchLanguage}</span>
    <span lang="en" class="sr-only">{ui.en.switchLanguage}</span>
  </button>
  <a
    href={originalSrc}
    target="_blank"
    rel="noopener"
    class="lightbox-control gap-2 px-3 text-sm tabular-nums"
    aria-label={`${ui[lang].openOriginal} (${currentIndex + 1} ${ui[lang].positionOf} ${count})`}
  >
    {currentIndex + 1} / {count}
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      class="size-4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path d="M14 5h5v5M19 5l-9 9" />
      <path d="M11 5H5v14h14v-6" />
    </svg>
  </a>
</div>

<style>
  .lightbox-control {
    pointer-events: auto;
    display: flex;
    min-width: var(--lightbox-control);
    height: var(--lightbox-control);
    flex: none;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(255 255 255 / 40%);
    background: #000;
    color: #fff;
    white-space: nowrap;
    cursor: pointer;
  }

  .lightbox-control:hover {
    border-color: #fff;
  }

  /* The black ring keeps an inverted control distinct over a light surface,
     such as the card back or a white drawing. */
  .lightbox-control:active,
  .lightbox-control[aria-pressed='true'],
  .lightbox-control[aria-current='true'] {
    border-color: #fff;
    background: #fff;
    color: #000;
    box-shadow: 0 0 0 2px #000;
  }

  .lightbox-control:disabled {
    cursor: default;
  }

  .lightbox-control:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  /* One joined strip: neighbouring options share a border, and the current
     option's white border and ring stay above the shared ones. */
  .lightbox-set-option + .lightbox-set-option {
    margin-left: -1px;
  }

  .lightbox-set-option[aria-current='true'] {
    position: relative;
  }

  /* Aside, an arrow has moved out past its screen edge, and is hidden once
     it gets there. */
  .lightbox-arrow {
    --lightbox-arrow-edge: 1;
    position: absolute;
    top: 50%;
    translate: calc(
        var(--lightbox-arrow-edge) * var(--lightbox-arrows-aside) *
          (100% + var(--lightbox-gap))
      )
      -50%;
  }

  .lightbox-arrow-previous {
    --lightbox-arrow-edge: -1;
  }

  .lightbox-arrow-away {
    visibility: hidden;
  }

  /* With reduced motion an arrow fades aside instead, as the card's faces do. */
  @media (prefers-reduced-motion: reduce) {
    .lightbox-arrow {
      translate: 0 -50%;
      opacity: calc(1 - var(--lightbox-arrows-aside));
    }
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { ui, type Lang } from '../i18n';

  // The back of a lightbox image's card: its title and description as one
  // justified, scrolling column. `scrollTop` is where it opens and, when bound,
  // follows the reader's scrolling.
  let {
    title,
    description,
    lang,
    scrollTop = $bindable(0),
  }: {
    title: string | undefined;
    description: string;
    lang: Lang;
    scrollTop?: number;
  } = $props();

  let scroller = $state<HTMLDivElement>()!;
  let viewHeight = $state(0);
  let contentHeight = $state(0);

  onMount(() => {
    scroller.scrollTop = scrollTop;
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrolling region needs focus to scroll by keyboard) -->
<div
  bind:this={scroller}
  bind:clientHeight={viewHeight}
  class="lightbox-verso absolute inset-(--lightbox-band) cursor-auto touch-pan-y overflow-y-auto overscroll-contain max-[480px]:inset-x-6"
  class:lightbox-verso-more-above={scrollTop > 1}
  class:lightbox-verso-more-below={scrollTop + viewHeight < contentHeight - 1}
  role="region"
  aria-label={title ?? ui[lang].description}
  tabindex="0"
  {lang}
  data-lightbox-scroll
  onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
>
  <div
    bind:clientHeight={contentHeight}
    class="flex min-h-full py-[clamp(1.5rem,8vh,6rem)]"
  >
    <article class="m-auto w-full max-w-2xl">
      {#if title}
        <h2 class="mb-3 text-2xl leading-tight sm:mb-4 sm:text-3xl">{title}</h2>
      {/if}
      <p class="text-base leading-relaxed text-justify hyphens-auto">
        {description}
      </p>
    </article>
  </div>
</div>

<style>
  /* The edges fade only where more text continues. */
  .lightbox-verso {
    --fade-top: 0rem;
    --fade-bottom: 0rem;
    mask-image: linear-gradient(
      transparent,
      #000 var(--fade-top),
      #000 calc(100% - var(--fade-bottom)),
      transparent
    );
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 50%) transparent;
  }

  .lightbox-verso-more-above {
    --fade-top: 3rem;
  }

  .lightbox-verso-more-below {
    --fade-bottom: 3rem;
  }

  .lightbox-verso:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -2px;
  }
</style>

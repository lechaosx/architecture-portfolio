<script lang="ts">
  import { hasCaption, type GalleryImage } from './gallery';

  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY component that ships JS to the browser.
  let { images = [] }: { images?: GalleryImage[] } = $props();

  let open = $state(false);
  let index = $state(0);

  function show(i: number) {
    index = i;
    open = true;
  }
  function close() {
    open = false;
  }
  function next() {
    index = (index + 1) % images.length;
  }
  function prev() {
    index = (index - 1 + images.length) % images.length;
  }
  function onkeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }
</script>

<svelte:window {onkeydown} />

{#if images.length}
  <div class="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3">
    {#each images as img, i}
      <button
        type="button"
        class="group aspect-square overflow-hidden bg-neutral-100"
        onclick={() => show(i)}
        aria-label={`Open image ${i + 1}`}
      >
        <img
          src={img.image}
          alt=""
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </button>
    {/each}
  </div>
{/if}

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    role="dialog"
    aria-modal="true"
    onclick={close}
  >
    <button
      class="absolute top-4 right-6 text-3xl leading-none text-white/70 hover:text-white"
      onclick={close}
      aria-label="Close">×</button
    >
    <button
      class="absolute left-4 text-4xl leading-none text-white/70 hover:text-white"
      onclick={(e) => {
        e.stopPropagation();
        prev();
      }}
      aria-label="Previous">‹</button
    >
    <figure
      class="flex max-h-full max-w-full flex-col items-center"
      onclick={(e) => e.stopPropagation()}
    >
      <img
        src={images[index].image}
        alt=""
        class={hasCaption(images[index])
          ? 'max-h-[calc(100vh-10rem)] max-w-full object-contain'
          : 'max-h-[85vh] max-w-full object-contain'}
      />
      {#if hasCaption(images[index])}
        <figcaption class="mt-4 w-full max-w-2xl text-white">
          {#if images[index].title_cs}
            <p lang="cs" class="text-sm font-medium">{images[index].title_cs}</p>
          {/if}
          {#if images[index].title_en}
            <p lang="en" class="text-sm font-medium">{images[index].title_en}</p>
          {/if}
          {#if images[index].description_cs}
            <p lang="cs" class="mt-1 text-sm text-white/70">
              {images[index].description_cs}
            </p>
          {/if}
          {#if images[index].description_en}
            <p lang="en" class="mt-1 text-sm text-white/70">
              {images[index].description_en}
            </p>
          {/if}
        </figcaption>
      {/if}
    </figure>
    <button
      class="absolute right-4 text-4xl leading-none text-white/70 hover:text-white"
      onclick={(e) => {
        e.stopPropagation();
        next();
      }}
      aria-label="Next">›</button
    >
  </div>
{/if}

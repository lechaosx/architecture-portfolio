<script lang="ts">
  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY component that ships JS to the browser.
  let { images = [] as string[] } = $props();

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
          src={img}
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
    <img
      src={images[index]}
      alt=""
      class="max-h-[85vh] max-w-full object-contain"
      onclick={(e) => e.stopPropagation()}
    />
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

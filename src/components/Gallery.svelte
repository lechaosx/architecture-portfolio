<script lang="ts">
  import {
    clampPan,
    hasCaption,
    panForZoom,
    scaleFromWheel,
    swipeDirection,
    type GalleryImage,
    type Point,
  } from './gallery';
  import { responsiveSrcset, THUMBNAIL_WIDTHS } from '../images';

  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY component that ships JS to the browser.
  let { images = [] }: { images?: GalleryImage[] } = $props();

  let open = $state(false);
  let index = $state(0);
  let scale = $state(1);
  let pan = $state<Point>({ x: 0, y: 0 });
  let dragging = $state(false);
  let stage: HTMLDivElement;
  let image: HTMLImageElement;
  let dragStart: Point | null = null;
  let touchStart: Point | null = null;

  function resetView() {
    scale = 1;
    pan = { x: 0, y: 0 };
    dragging = false;
    dragStart = null;
    touchStart = null;
  }

  function show(i: number) {
    index = i;
    resetView();
    open = true;
  }
  function close() {
    open = false;
    resetView();
  }
  function go(offset: number) {
    index = (index + offset + images.length) % images.length;
    resetView();
  }
  function next() {
    go(1);
  }
  function prev() {
    go(-1);
  }
  function onkeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }

  function constrainedPan(nextPan: Point, nextScale = scale) {
    if (!stage || !image) return nextPan;
    return clampPan(
      nextPan,
      nextScale,
      { width: image.clientWidth, height: image.clientHeight },
      { width: stage.clientWidth, height: stage.clientHeight },
    );
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const delta =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? e.deltaY * 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? e.deltaY * stage.clientHeight
          : e.deltaY;
    const nextScale = scaleFromWheel(scale, delta);
    const bounds = stage.getBoundingClientRect();
    const pointer = {
      x: e.clientX - (bounds.left + bounds.width / 2),
      y: e.clientY - (bounds.top + bounds.height / 2),
    };
    pan = constrainedPan(panForZoom(pan, scale, nextScale, pointer), nextScale);
    scale = nextScale;
  }

  function onpointerdown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || scale === 1) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    dragging = true;
    dragStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging || !dragStart) return;
    pan = constrainedPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }

  function onpointerup(e: PointerEvent) {
    if (!dragging) return;
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    dragging = false;
    dragStart = null;
  }

  function ontouchstart(e: TouchEvent) {
    touchStart =
      e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : null;
  }

  function ontouchmove(e: TouchEvent) {
    if (e.touches.length !== 1) touchStart = null;
  }

  function ontouchend(e: TouchEvent) {
    if (!touchStart || e.touches.length || e.changedTouches.length !== 1) {
      touchStart = null;
      return;
    }
    const touch = e.changedTouches[0];
    const direction = swipeDirection(
      touch.clientX - touchStart.x,
      touch.clientY - touchStart.y,
    );
    touchStart = null;
    if (direction === 1) next();
    else if (direction === -1) prev();
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
          srcset={responsiveSrcset(img.image, THUMBNAIL_WIDTHS)}
          sizes="(min-width: 896px) 275px, (min-width: 640px) calc((100vw - 72px) / 3), calc((100vw - 60px) / 2)"
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
      type="button"
      class="absolute top-4 left-4 z-20 min-w-16 cursor-pointer border border-white/40 px-3 py-2 text-sm tabular-nums text-white hover:border-white"
      onclick={(e) => {
        e.stopPropagation();
        resetView();
      }}
    >
      <span aria-hidden="true">{Math.round(scale * 100)}%</span>
      <span lang="cs" class="sr-only">Obnovit přiblížení</span>
      <span lang="en" class="sr-only">Reset zoom</span>
    </button>
    <button
      class="absolute top-4 right-4 z-20 flex h-10 w-10 cursor-pointer items-center justify-center border border-white/40 text-3xl leading-none text-white hover:border-white"
      onclick={close}
      aria-label="Close">×</button
    >
    <button
      class="absolute left-4 z-20 flex h-12 w-12 cursor-pointer items-center justify-center border border-white/40 text-4xl leading-none text-white hover:border-white"
      onclick={(e) => {
        e.stopPropagation();
        prev();
      }}
      aria-label="Previous">‹</button
    >
    <figure
      class="flex h-[85vh] w-full flex-col items-center sm:px-16"
      onclick={(e) => e.stopPropagation()}
    >
      <div
        bind:this={stage}
        class="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
        style:cursor={scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default'}
        {onwheel}
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        onpointercancel={onpointerup}
        {ontouchstart}
        {ontouchmove}
        {ontouchend}
        ontouchcancel={() => (touchStart = null)}
      >
        <img
          bind:this={image}
          src={images[index].image}
          alt=""
          draggable="false"
          class="max-h-full max-w-full object-contain select-none"
          style:transform={`translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`}
          onload={() => (pan = constrainedPan(pan))}
        />
      </div>
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
      class="absolute right-4 z-20 flex h-12 w-12 cursor-pointer items-center justify-center border border-white/40 text-4xl leading-none text-white hover:border-white"
      onclick={(e) => {
        e.stopPropagation();
        next();
      }}
      aria-label="Next">›</button
    >
  </div>
{/if}

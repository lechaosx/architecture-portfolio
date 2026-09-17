<script lang="ts">
  import { onMount } from 'svelte';
  import type OpenSeadragon from 'openseadragon';
  import type { ResponsiveImage } from '../images';
  import { ui } from '../i18n';
  import {
    clampPan,
    hasCaption,
    lightboxImageUrl,
    nativeZoomScale,
    panForPinch,
    panForZoom,
    scaleFromPinch,
    scaleFromWheel,
    swipeDirection,
    type GalleryImage,
    type Point,
  } from './gallery';
  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY component that ships JS to the browser.
  let {
    images = [],
    responsiveImages = [],
    thumbnailSrcsets = [],
  }: {
    images?: GalleryImage[];
    responsiveImages?: (ResponsiveImage | undefined)[];
    thumbnailSrcsets?: (string | undefined)[];
  } = $props();

  let open = $state(false);
  let index = $state(0);
  let scale = $state(1);
  let pan = $state<Point>({ x: 0, y: 0 });
  let dragging = $state(false);
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let devicePixelRatio = $state(1);
  let deepZoomScale = $state(1);
  let stage: HTMLDivElement;
  let image: HTMLImageElement;
  let deepZoomElement = $state<HTMLDivElement>();
  let deepZoomViewer: OpenSeadragon.Viewer | undefined;
  let deepZoomTouchStart: Point | null = null;
  let dragStart: Point | null = null;
  let touchStart: Point | null = null;
  let touchPanStart: Point | null = null;
  let pinchStart: {
    distance: number;
    scale: number;
    center: Point;
    pan: Point;
  } | null = null;
  let lightboxSrc = $derived(
    responsiveImages[index]
      ? lightboxImageUrl(
          responsiveImages[index],
          { width: stageWidth, height: stageHeight },
          scale,
          devicePixelRatio,
        )
      : images[index]?.image,
  );
  let originalSrc = $derived(
    responsiveImages[index]?.source.url ?? images[index]?.image,
  );
  let deepZoom = $derived(responsiveImages[index]?.deepZoom);

  $effect(() => {
    const descriptor = deepZoom;
    const element = deepZoomElement;
    if (!open || !descriptor || !element) return;

    let cancelled = false;
    let viewer: OpenSeadragon.Viewer | undefined;

    void import('openseadragon').then(({ default: createViewer }) => {
      if (cancelled) return;
      viewer = createViewer({
        element,
        tileSources: descriptor.url,
        showNavigationControl: false,
        showNavigator: false,
        constrainDuringPan: true,
        visibilityRatio: 1,
        maxZoomPixelRatio: 1,
        minPixelRatio: 1,
      });
      deepZoomViewer = viewer;
      viewer.addHandler('open', () => {
        if (!viewer) return;
        deepZoomScale = 1;
      });
      viewer.addHandler('zoom', ({ zoom }) => {
        if (!viewer) return;
        deepZoomScale = zoom / viewer.viewport.getHomeZoom();
        if (deepZoomScale > 1) deepZoomTouchStart = null;
      });
      viewer.addHandler('canvas-press', ({ pointerType, position }) => {
        deepZoomTouchStart =
          pointerType === 'touch' && deepZoomScale <= 1.001 ? position : null;
      });
      viewer.addHandler('canvas-pinch', () => {
        deepZoomTouchStart = null;
      });
      viewer.addHandler('canvas-release', ({ pointerType, position }) => {
        if (pointerType !== 'touch' || !deepZoomTouchStart) return;
        const direction = swipeDirection(
          position.x - deepZoomTouchStart.x,
          position.y - deepZoomTouchStart.y,
        );
        deepZoomTouchStart = null;
        if (direction === 1) next();
        else if (direction === -1) prev();
      });
    });

    return () => {
      cancelled = true;
      viewer?.destroy();
      if (deepZoomViewer === viewer) deepZoomViewer = undefined;
      deepZoomTouchStart = null;
      deepZoomScale = 1;
    };
  });

  onMount(() => {
    devicePixelRatio = window.devicePixelRatio || 1;
    stageWidth = window.innerWidth;
    stageHeight = window.innerHeight * 0.85;
  });

  function resetView() {
    deepZoomViewer?.viewport.goHome();
    deepZoomScale = 1;
    scale = 1;
    pan = { x: 0, y: 0 };
    dragging = false;
    dragStart = null;
    touchStart = null;
    touchPanStart = null;
    pinchStart = null;
    deepZoomTouchStart = null;
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

  function maximumScale() {
    const responsiveImage = responsiveImages[index];
    if (!responsiveImage || !image) return 1;
    return nativeZoomScale(
      responsiveImage.source.width,
      image.clientWidth,
      devicePixelRatio,
    );
  }

  function onwheel(e: WheelEvent) {
    if (deepZoom) return;
    e.preventDefault();
    const delta =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? e.deltaY * 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? e.deltaY * stage.clientHeight
          : e.deltaY;
    const nextScale = scaleFromWheel(scale, delta, maximumScale());
    const bounds = stage.getBoundingClientRect();
    const pointer = {
      x: e.clientX - (bounds.left + bounds.width / 2),
      y: e.clientY - (bounds.top + bounds.height / 2),
    };
    pan = constrainedPan(panForZoom(pan, scale, nextScale, pointer), nextScale);
    scale = nextScale;
  }

  function onpointerdown(e: PointerEvent) {
    if (deepZoom) return;
    if (e.pointerType !== 'mouse' || e.button !== 0 || scale === 1) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    dragging = true;
    dragStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }

  function onpointermove(e: PointerEvent) {
    if (deepZoom) return;
    if (!dragging || !dragStart) return;
    pan = constrainedPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }

  function onpointerup(e: PointerEvent) {
    if (deepZoom) return;
    if (!dragging) return;
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    dragging = false;
    dragStart = null;
  }

  function ontouchstart(e: TouchEvent) {
    if (deepZoom) return;
    if (e.touches.length === 2) {
      const first = touchPoint(e.touches[0]);
      const second = touchPoint(e.touches[1]);
      pinchStart = {
        distance: touchDistance(first, second),
        scale,
        center: touchCenter(first, second),
        pan,
      };
      touchStart = null;
      touchPanStart = null;
      return;
    }

    if (e.touches.length === 1) {
      const point = touchPoint(e.touches[0]);
      touchStart = scale === 1 ? point : null;
      touchPanStart =
        scale > 1 ? { x: point.x - pan.x, y: point.y - pan.y } : null;
      return;
    }

    resetTouchGesture();
  }

  function ontouchmove(e: TouchEvent) {
    if (deepZoom) return;
    if (e.touches.length === 2 && pinchStart) {
      const first = touchPoint(e.touches[0]);
      const second = touchPoint(e.touches[1]);
      const nextScale = scaleFromPinch(
        pinchStart.scale,
        pinchStart.distance,
        touchDistance(first, second),
        maximumScale(),
      );
      pan = constrainedPan(
        panForPinch(
          pinchStart.pan,
          pinchStart.scale,
          nextScale,
          pinchStart.center,
          touchCenter(first, second),
        ),
        nextScale,
      );
      scale = nextScale;
      return;
    }

    if (e.touches.length === 1 && touchPanStart) {
      const point = touchPoint(e.touches[0]);
      pan = constrainedPan({
        x: point.x - touchPanStart.x,
        y: point.y - touchPanStart.y,
      });
      return;
    }

    if (e.touches.length !== 1) touchStart = null;
  }

  function ontouchend(e: TouchEvent) {
    if (deepZoom) return;
    if (pinchStart) {
      pinchStart = null;
      touchStart = null;
      if (e.touches.length === 1 && scale > 1) {
        const point = touchPoint(e.touches[0]);
        touchPanStart = { x: point.x - pan.x, y: point.y - pan.y };
      } else {
        touchPanStart = null;
      }
      return;
    }

    if (touchPanStart) {
      if (e.touches.length === 0) touchPanStart = null;
      return;
    }

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

  function touchPoint(touch: Touch): Point {
    return { x: touch.clientX, y: touch.clientY };
  }

  function touchDistance(first: Point, second: Point) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function touchCenter(first: Point, second: Point): Point {
    const bounds = stage.getBoundingClientRect();
    return {
      x: (first.x + second.x) / 2 - (bounds.left + bounds.width / 2),
      y: (first.y + second.y) / 2 - (bounds.top + bounds.height / 2),
    };
  }

  function resetTouchGesture() {
    touchStart = null;
    touchPanStart = null;
    pinchStart = null;
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
          srcset={thumbnailSrcsets[i]}
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
    <div class="absolute top-4 right-4 left-4 z-20 flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="min-w-16 cursor-pointer border border-white/40 px-3 py-2 text-sm tabular-nums text-white hover:border-white"
          onclick={(e) => {
            e.stopPropagation();
            resetView();
          }}
        >
          <span aria-hidden="true">
            {Math.round((deepZoom ? deepZoomScale : scale) * 100)}%
          </span>
          <span lang="cs" class="sr-only">Obnovit přiblížení</span>
          <span lang="en" class="sr-only">Reset zoom</span>
        </button>
        <a
          href={originalSrc}
          target="_blank"
          rel="noopener"
          class="border border-white/40 px-3 py-2 text-sm text-white hover:border-white"
          onclick={(e) => e.stopPropagation()}
        >
          <span lang="cs">{ui.cs.openOriginal}</span>
          <span lang="en">{ui.en.openOriginal}</span>
        </a>
      </div>
      <button
        class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border border-white/40 text-3xl leading-none text-white hover:border-white"
        onclick={close}
        aria-label="Close">×</button
      >
    </div>
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
        bind:clientWidth={stageWidth}
        bind:clientHeight={stageHeight}
        class="relative flex min-h-0 w-full flex-1 touch-none items-center justify-center overflow-hidden"
        style:cursor={!deepZoom && scale > 1
          ? dragging
            ? 'grabbing'
            : 'grab'
          : 'default'}
        {onwheel}
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        onpointercancel={onpointerup}
        {ontouchstart}
        {ontouchmove}
        {ontouchend}
        ontouchcancel={resetTouchGesture}
      >
        {#if deepZoom}
          <div bind:this={deepZoomElement} class="h-full w-full"></div>
        {:else}
          <img
            bind:this={image}
            src={lightboxSrc}
            alt=""
            draggable="false"
            class="max-h-full max-w-full object-contain select-none"
            style:transform={`translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`}
            onload={() => (pan = constrainedPan(pan))}
          />
        {/if}
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

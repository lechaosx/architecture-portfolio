<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    devicePixelRatio,
    innerHeight,
    innerWidth,
  } from 'svelte/reactivity/window';
  import type { ResponsiveImage } from '../images';
  import { ui, type Lang } from '../i18n';
  import {
    CONTROL_SIZE,
    PHONE_WIDTH,
    clampPan,
    clampScale,
    comparisonSetIndexes,
    containedImageSize,
    displayedSwipeOffset,
    imageText,
    lightboxAreas,
    lightboxImageUrl,
    nativeZoomScale,
    panForZoom,
    scrubProgress,
    settleDuration,
    sharedMaximumScale,
    textColumnLimit,
    zoomFloor,
    type GalleryImage,
    type Point,
    type Size,
    type View,
    type ZoomRange,
  } from './gallery';
  import {
    LightboxGestures,
    type GestureContext,
    type GestureIntent,
  } from './lightbox-gestures';
  import { LightboxHistory } from './lightbox-history';
  import { morphClose, morphOpen } from './lightbox-morph';
  import LightboxCard, { hasBack, type CardImage } from './LightboxCard.svelte';
  import LightboxControls from './LightboxControls.svelte';
  import LightboxTiles from './LightboxTiles.svelte';
  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY island that ships JS to the browser.
  let { images, responsiveImages }: {
    images: GalleryImage[];
    responsiveImages: (ResponsiveImage | undefined)[];
  } = $props();

  const blendDuration = 180;
  const slideDuration = 180;
  const flipDuration = 560;
  const reducedFlipDuration = 150;
  const zoomKeys = new Map<string, 'in' | 'out' | 'reset'>([
    ['+', 'in'],
    ['=', 'in'],
    ['-', 'out'],
    ['0', 'reset'],
  ]);

  let open = $state(false);
  let lang = $state<Lang>('en');
  let index = $state(0);
  let view = $state.raw<View>({ scale: 1, pan: { x: 0, y: 0 } });
  let showDescription = $state(false);
  // A drawing without responsive variants reveals its size once it loads.
  let loadedSize = $state<{ src: string; width: number; height: number }>();
  // A move towards a variant of the current card: `progress` 1 shows `target`.
  let change = $state<{ target: number; progress: number }>();
  // How long the card's next turn or blend takes; 0 moves it at once.
  let cardDuration = $state(0);
  // The back's reading position, which starts at the top whenever it turns up.
  let descriptionScroll = $state(0);
  // Set only by the interpreter's `grab` intents, for the cursor.
  let grabbing = $state(false);
  let swipeOffset = $state(0);
  let swipeAnimating = $state(false);
  let lightboxTransitioning = $state(false);
  let navigating = $state(false);
  let reducedMotion = $state(false);
  let closing = false;
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let pixelRatio = $derived(devicePixelRatio.current ?? 1);
  let stage = $state<HTMLDivElement>()!;
  let image = $state<HTMLImageElement>()!;
  let dialog = $state<HTMLDialogElement>()!;
  let closeButton = $state<HTMLButtonElement>();
  let trigger: HTMLButtonElement | undefined;
  let thumbnailButtons: HTMLButtonElement[] = [];
  const gestures = new LightboxGestures();
  const imageHistory = new LightboxHistory(images.length, {
    isOpen: () => open,
    show: (imageIndex) => void showFromHistory(imageIndex),
    close: closeFromHistory,
  });
  let navigationRun = 0;
  let stripRun = 0;
  let areas = $derived(
    lightboxAreas({ width: stageWidth, height: stageHeight }),
  );
  let lightboxImageSize = $derived(restImageSize(index));
  let originalSrc = $derived(
    responsiveImages[index]?.originalUrl ?? images[index]?.image,
  );
  let previousIndex = $derived(
    images.length ? (index - 1 + images.length) % images.length : 0,
  );
  let nextIndex = $derived(images.length ? (index + 1) % images.length : 0);
  let comparisonIndexes = $derived(comparisonSetIndexes(images, index));
  // The cards and their text do not depend on the view; only the sources do,
  // as zooming asks for more detail.
  let current = $derived(cardImage(index, lightboxImageSize));
  let currentSrc = $derived(drawingUrl(index));
  let incomingIndex = $derived(change?.target);
  let incoming = $derived(
    incomingIndex === undefined
      ? undefined
      : cardImage(incomingIndex, restImageSize(incomingIndex)),
  );
  let incomingSrc = $derived(
    incomingIndex === undefined ? undefined : drawingUrl(incomingIndex),
  );
  let flipped = $derived(showDescription && hasBack(current));
  let phone = $derived(stageWidth <= PHONE_WIDTH);
  let columnLimit = $derived(textColumnLimit(stageWidth, areas.band));
  let setOptions = $derived(
    (comparisonIndexes.length
      ? comparisonIndexes
      : current.title
        ? [index]
        : []
    ).map((setIndex) => ({ index: setIndex, label: setStripLabel(setIndex) })),
  );
  let zoomRange = $derived<ZoomRange>({
    min: lightboxImageSize ? zoomFloor(lightboxImageSize, areas.safe) : 1,
    max: maximumScale(),
  });
  let slideTransition = $derived(
    swipeAnimating
      ? `transform ${slideDuration}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : 'none',
  );
  $effect(() => {
    if (!reducedMotion) return;
    swipeAnimating = false;
    swipeOffset = 0;
  });
  // A resize, a rotation or another image keeps the current view within its
  // new limits.
  $effect(() => {
    const range = zoomRange;
    const restImage = lightboxImageSize;
    const bounds = areas;
    untrack(() => {
      const scale = clampScale(view.scale, range);
      view = {
        scale,
        pan: restImage ? clampPan(view.pan, scale, restImage, bounds) : view.pan,
      };
    });
  });
  onMount(() => {
    const triggerHandlers = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-lightbox-index]'),
    ).flatMap((button) => {
      const imageIndex = Number(button.dataset.lightboxIndex);
      if (!Number.isInteger(imageIndex) || !images[imageIndex]) return [];
      thumbnailButtons[imageIndex] = button;
      const handler = () => void show(imageIndex, button);
      button.addEventListener('click', handler);
      return [{ button, handler }];
    });
    const syncLang = () => {
      lang = document.documentElement.dataset.lang === 'cs' ? 'cs' : 'en';
    };
    syncLang();
    const languageObserver = new MutationObserver(syncLang);
    languageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lang'],
    });
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      reducedMotion = motionQuery.matches;
    };
    syncMotionPreference();
    motionQuery.addEventListener('change', syncMotionPreference);

    imageHistory.restore();
    return () => {
      imageHistory.destroy();
      for (const { button, handler } of triggerHandlers) {
        button.removeEventListener('click', handler);
      }
      languageObserver.disconnect();
      motionQuery.removeEventListener('change', syncMotionPreference);
    };
  });

  function resetView() {
    view = { scale: 1, pan: { x: 0, y: 0 } };
    endDrag();
  }

  /**
   * Ends any live drag, since a change of image takes over from it, and
   * returns a strip the drag had moved.
   */
  function endDrag() {
    apply(gestures.end());
    void snapBack();
  }

  function previewUrl(imageIndex: number) {
    return imageUrl(imageIndex, 1);
  }

  function imageUrl(imageIndex: number, imageScale = view.scale) {
    const responsiveImage = responsiveImages[imageIndex];
    return responsiveImage
      ? lightboxImageUrl(responsiveImage, areas.rest, imageScale, pixelRatio)
      : images[imageIndex]?.image;
  }

  function restImageSize(imageIndex: number) {
    const source =
      responsiveImages[imageIndex]?.source ??
      (loadedSize?.src === images[imageIndex]?.image ? loadedSize : undefined);
    return source && stageWidth > 0 && stageHeight > 0
      ? containedImageSize(source, areas.rest)
      : undefined;
  }

  function cardImage(imageIndex: number, size: Size | undefined): CardImage {
    return {
      index: imageIndex,
      tiles: responsiveImages[imageIndex]?.deepZoom?.url,
      width: responsiveImages[imageIndex]?.source.width,
      height: responsiveImages[imageIndex]?.source.height,
      size,
      title: imageText(images[imageIndex], 'title', lang),
      description: imageText(images[imageIndex], 'description', lang),
    };
  }

  function setStripLabel(imageIndex: number) {
    return (
      imageText(images[imageIndex], 'title', lang) ??
      `${ui[lang].image} ${imageIndex + 1}`
    );
  }

  function slideTransform(position: number) {
    return `translate3d(${swipeOffset + position * stageWidth}px, 0, 0)`;
  }

  async function show(i: number, source: HTMLButtonElement) {
    trigger = source;
    source.blur();
    imageHistory.open(i);
    if (reducedMotion || !document.startViewTransition) {
      await showFromHistory(i);
      return;
    }
    lightboxTransitioning = true;
    try {
      await morphOpen(source, async () => {
        await showFromHistory(i);
        return image;
      });
    } catch {
      if (!open) await showFromHistory(i);
    } finally {
      lightboxTransitioning = false;
    }
  }
  async function showFromHistory(i: number) {
    cancelNavigation();
    closing = false;
    index = i;
    showDrawingSide();
    resetView();
    stageWidth = innerWidth.current ?? 0;
    stageHeight = innerHeight.current ?? 0;
    open = true;
    await tick();
    dialog.showModal();
    stageWidth = stage.clientWidth;
    stageHeight = stage.clientHeight;
    await tick();
    closeButton?.focus();
  }
  function requestClose() {
    if (!open || closing) return;
    closing = true;
    imageHistory.close();
  }
  async function closeFromHistory() {
    if (!open) return;
    const thumbnail = thumbnailButtons[index];
    if (reducedMotion || !thumbnail || !image || !document.startViewTransition) {
      await hideLightbox();
      return;
    }
    lightboxTransitioning = true;
    try {
      await morphClose(thumbnail, image, view.scale === 1 && !flipped, hideLightbox);
    } catch {
      await hideLightbox();
    } finally {
      lightboxTransitioning = false;
    }
  }
  async function hideLightbox() {
    cancelNavigation();
    closing = false;
    dialog.close();
    open = false;
    resetView();
    await tick();
    trigger?.focus({ preventScroll: true });
    trigger = undefined;
  }
  function isVariant(target: number) {
    return target !== index && comparisonIndexes.includes(target);
  }

  /**
   * Changes to image `target`: a variant of this card blends in, another card
   * slides in from `direction`.
   */
  async function changeTo(target: number, direction: number) {
    if (closing || navigating || images.length < 2 || target === index) {
      if (!navigating) void settleDrag();
      return;
    }
    endDrag();
    if (isVariant(target)) await blendTo(target);
    else await slideTo(target, direction);
  }

  async function slideTo(target: number, direction: number) {
    const run = ++navigationRun;
    navigating = true;
    change = undefined;
    if (!reducedMotion) {
      stripRun += 1;
      swipeAnimating = true;
      swipeOffset = -direction * (stage?.clientWidth || window.innerWidth);
      await waitFor(slideDuration);
      if (run !== navigationRun || !open) return;
    }
    swipeAnimating = false;
    swipeOffset = 0;
    showImage(target);
    resetView();
    navigating = false;
  }

  /** Blends into `target` at the current view, continuing a scrub towards it. */
  async function blendTo(target: number) {
    const run = ++navigationRun;
    navigating = true;
    if (!reducedMotion) {
      // A blend, scrubbed or not, completes only onto a decoded variant.
      await preloadBlend(target);
      if (run !== navigationRun || !open) return;
      const scrubbed = change?.target === target ? change.progress : 0;
      cardDuration = settleDuration(cardMoveDuration(), scrubbed, 1);
      change = { target, progress: 1 };
      await waitFor(cardDuration);
      if (run !== navigationRun || !open) return;
    }
    showImage(target);
    if (change) {
      // The blended layer stays until the card's own image can replace it.
      await tick();
      await image.decode().catch(() => {});
      if (run !== navigationRun) return;
      change = undefined;
    }
    navigating = false;
  }

  /** Returns a scrubbed blend to the current image. */
  async function cancelBlend() {
    const current = change;
    if (!current || navigating) return;
    const run = ++navigationRun;
    navigating = true;
    cardDuration = settleDuration(cardMoveDuration(), current.progress, 0);
    change = { ...current, progress: 0 };
    await waitFor(cardDuration);
    if (run !== navigationRun) return;
    change = undefined;
    navigating = false;
  }

  function cardMoveDuration() {
    return flipped ? flipDuration : blendDuration;
  }

  async function preloadBlend(target: number) {
    const preload = new Image();
    preload.src = drawingUrl(target);
    try {
      await preload.decode();
    } catch {}
  }

  /** A tiled drawing shows its preview beneath the tiles. */
  function drawingUrl(imageIndex: number) {
    return responsiveImages[imageIndex]?.deepZoom
      ? previewUrl(imageIndex)
      : imageUrl(imageIndex);
  }

  function showImage(target: number) {
    index = target;
    showDrawingSide();
    imageHistory.change(index);
  }

  function toggleDescription() {
    cardDuration = reducedMotion ? reducedFlipDuration : flipDuration;
    if (!flipped) descriptionScroll = 0;
    showDescription = !flipped;
  }

  /**
   * The card of a newly shown image starts drawing side up, without turning,
   * with its text at the top.
   */
  function showDrawingSide() {
    cardDuration = 0;
    showDescription = false;
    descriptionScroll = 0;
  }

  function next() {
    void changeTo(nextIndex, 1);
  }
  function prev() {
    void changeTo(previousIndex, -1);
  }
  function onkeydown(e: KeyboardEvent) {
    if (!open) return;
    const zoomAction = zoomKeys.get(e.key);
    if (e.key === 'Tab') {
      // A modal <dialog> lets Tab leave for the browser chrome at either end.
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => !element.closest('[inert]'));
      const edge = e.shiftKey ? focusable[0] : focusable.at(-1);
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (zoomAction) {
      // With a modifier these are the browser's own zoom.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      apply(gestures.key(zoomAction, gestureContext()), e);
    } else if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
        e.key,
      ) &&
      !(e.target instanceof Element && e.target.matches('[data-lightbox-scroll]'))
    ) {
      e.preventDefault();
    }
  }

  function cancelNavigation() {
    navigationRun += 1;
    change = undefined;
    navigating = false;
    swipeAnimating = false;
    swipeOffset = 0;
  }

  /** Eases the strip back to rest, unless a slide takes the strip over meanwhile. */
  async function snapBack() {
    if (swipeOffset === 0) return;
    const run = ++stripRun;
    swipeAnimating = !reducedMotion;
    swipeOffset = 0;
    if (swipeAnimating) await waitFor(slideDuration);
    if (run === stripRun) swipeAnimating = false;
  }

  function waitFor(duration: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, duration));
  }

  /**
   * A drag at rest scrubs the blend towards a variant, or moves the strip
   * towards another card.
   */
  function dragAtRest(deltaX: number) {
    swipeAnimating = false;
    const target = deltaX < 0 ? nextIndex : previousIndex;
    if (deltaX !== 0 && !reducedMotion && isVariant(target)) {
      swipeOffset = 0;
      cardDuration = 0;
      change = { target, progress: scrubProgress(deltaX, stageWidth) };
    } else {
      change = undefined;
      swipeOffset = displayedSwipeOffset(deltaX, reducedMotion);
    }
  }

  function settleDrag() {
    return change ? cancelBlend() : snapBack();
  }

  function constrainedPan(nextPan: Point, nextScale = view.scale) {
    const imageSize = renderedImageSize();
    return imageSize ? clampPan(nextPan, nextScale, imageSize, areas) : nextPan;
  }

  function renderedImageSize() {
    if (lightboxImageSize) return lightboxImageSize;
    if (image) return { width: image.clientWidth, height: image.clientHeight };
  }

  function maximumScaleFor(imageIndex: number) {
    const responsiveImage = responsiveImages[imageIndex];
    const imageSize = restImageSize(imageIndex);
    if (!responsiveImage || !imageSize) return 1;
    return nativeZoomScale(
      responsiveImage.source.width,
      imageSize.width,
      pixelRatio,
    );
  }

  function maximumScale() {
    const indexes = comparisonIndexes.length ? comparisonIndexes : [index];
    return sharedMaximumScale(indexes.map(maximumScaleFor));
  }

  /** Scales to `scale` while keeping the image point under `point` in place. */
  function zoomTo(scale: number, point: Point) {
    view = {
      scale,
      pan: constrainedPan(panForZoom(view.pan, view.scale, scale, point), scale),
    };
  }

  /** A client point relative to the stage centre. */
  function stagePoint({ clientX, clientY }: { clientX: number; clientY: number }) {
    const bounds = stage.getBoundingClientRect();
    return {
      x: clientX - (bounds.left + bounds.width / 2),
      y: clientY - (bounds.top + bounds.height / 2),
    };
  }

  function stagePoints(touches: TouchList) {
    return Array.from(touches, stagePoint);
  }

  function busy() {
    return lightboxTransitioning || navigating;
  }

  function gestureContext(): GestureContext {
    return { view, range: zoomRange, flipped, busy: busy() };
  }

  /** Carries out the interpreter's intents for `event`, the input that raised them. */
  function apply(intents: GestureIntent[], event?: Event) {
    for (const intent of intents) {
      if (intent.type === 'claim') {
        event?.preventDefault();
      } else if (intent.type === 'grab') {
        grabbing = intent.grabbing;
        if (grabbing && event instanceof PointerEvent) {
          stage.setPointerCapture(event.pointerId);
        }
      } else if (intent.type === 'view') {
        view = { scale: intent.scale, pan: constrainedPan(intent.pan, intent.scale) };
      } else if (intent.type === 'zoom') {
        zoomTo(intent.scale, intent.point);
      } else if (intent.type === 'drag') {
        dragAtRest(intent.offset);
      } else if (intent.type === 'commit') {
        void changeTo(intent.direction > 0 ? nextIndex : previousIndex, intent.direction);
      } else if (intent.type === 'settle') {
        void settleDrag();
      } else {
        swipeAnimating = false;
        swipeOffset = 0;
        change = undefined;
      }
    }
  }

  function onwheel(e: WheelEvent) {
    const delta =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? e.deltaY * 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? e.deltaY * stage.clientHeight
          : e.deltaY;
    apply(gestures.wheel(delta, stagePoint(e), gestureContext()), e);
  }

  function ondblclick(e: MouseEvent) {
    apply(gestures.doubleClick(stagePoint(e), gestureContext()), e);
  }

  function preventPageScroll(event: WheelEvent | TouchEvent) {
    if (
      !(
        event.target instanceof Element &&
        event.target.closest('[data-lightbox-scroll]')
      )
    ) {
      event.preventDefault();
    }
  }

  // Touch input arrives as touch events, so only the mouse drives pointer gestures.
  function onpointerdown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const onText =
      e.target instanceof Element && Boolean(e.target.closest('[data-lightbox-scroll]'));
    apply(gestures.mouseDown(stagePoint(e), onText, gestureContext()), e);
  }

  function onpointermove(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    apply(gestures.mouseMove(stagePoint(e), gestureContext()), e);
  }

  function onpointerup(e: PointerEvent) {
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') apply(gestures.mouseUp(), e);
  }

  function onpointercancel(e: PointerEvent) {
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') apply(gestures.mouseCancel(), e);
  }

  function ontouchstart(e: TouchEvent) {
    apply(gestures.touchStart(stagePoints(e.touches), selectingText(), gestureContext()), e);
  }

  function ontouchmove(e: TouchEvent) {
    apply(gestures.touchMove(stagePoints(e.touches), selectingText(), gestureContext()), e);
  }

  function ontouchend(e: TouchEvent) {
    apply(
      gestures.touchEnd(
        stagePoints(e.touches),
        stagePoints(e.changedTouches),
        e.timeStamp,
        gestureContext(),
      ),
      e,
    );
  }

  function onImageLoad() {
    if (!responsiveImages[index]) {
      loadedSize = {
        src: images[index].image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }
    view = { scale: view.scale, pan: constrainedPan(view.pan) };
  }

  function selectingText() {
    const selection = getSelection();
    return Boolean(
      selection &&
        !selection.isCollapsed &&
        stage.contains(selection.anchorNode),
    );
  }
</script>

<svelte:window {onkeydown} onpopstate={() => imageHistory.popstate()} />

{#if open}
  <dialog
    bind:this={dialog}
    data-gallery-lightbox
    class="lightbox fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-black/90 p-0 text-white"
    style:--lightbox-gap={`${areas.gap}px`}
    style:--lightbox-band={`${areas.band}px`}
    style:--lightbox-control={`${CONTROL_SIZE}px`}
    aria-label={ui[lang].imageViewer}
    aria-busy={lightboxTransitioning}
    oncancel={(event) => {
      event.preventDefault();
      requestClose();
    }}
    onwheel={preventPageScroll}
    ontouchmove={preventPageScroll}
  >
    <!-- Isolated, so no layer inside can paint over the controls that follow. -->
    <div
      bind:this={stage}
      bind:clientWidth={stageWidth}
      bind:clientHeight={stageHeight}
      role="presentation"
      class="lightbox-stage absolute inset-0 isolate touch-none overflow-hidden"
      style:cursor={grabbing ? 'grabbing' : 'grab'}
      onscrollcapture={(e) => apply(gestures.textScrolled(), e)}
      {onwheel}
      {ondblclick}
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onpointercancel}
      {ontouchstart}
      {ontouchmove}
      {ontouchend}
      ontouchcancel={(e) => apply(gestures.touchCancel(), e)}
    >
      {#if images.length > 1}
        {@render neighbour('lightbox-slide-previous', -1, previousIndex)}
      {/if}
      <div
        class="lightbox-slide-current absolute inset-0 overflow-hidden"
        style:transform={slideTransform(0)}
        style:transition={slideTransition}
      >
        <LightboxCard
          {current}
          {currentSrc}
          {incoming}
          {incomingSrc}
          blend={change?.progress ?? 0}
          {flipped}
          {view}
          duration={cardDuration}
          restArea={areas.rest}
          {columnLimit}
          {lang}
          {tiledCanvas}
          bind:scrollTop={descriptionScroll}
          bind:image
          onload={onImageLoad}
        />
      </div>
      {#if images.length > 1}
        {@render neighbour('lightbox-slide-next', 1, nextIndex)}
      {/if}
    </div>

    <LightboxControls
      {lang}
      {setOptions}
      currentIndex={index}
      count={images.length}
      {originalSrc}
      hasBack={hasBack(current)}
      {flipped}
      arrowsAside={phone && flipped}
      {reducedMotion}
      bind:closeButton
      onselect={(setIndex) => void changeTo(setIndex, Math.sign(setIndex - index))}
      onprevious={prev}
      onnext={next}
      onclose={requestClose}
      ontoggle={toggleDescription}
    />
    <p role="status" aria-atomic="true" class="sr-only">
      {index + 1} / {images.length}
    </p>
  </dialog>
{/if}

<!-- The previous and next images, beside the card in one sliding strip. -->
{#snippet neighbour(className: string, position: number, imageIndex: number)}
  {@const size = restImageSize(imageIndex)}
  <div
    class="{className} pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
    style:transform={slideTransform(position)}
    style:transition={slideTransition}
    aria-hidden="true"
  >
    <img
      src={previewUrl(imageIndex)}
      width={responsiveImages[imageIndex]?.source.width}
      height={responsiveImages[imageIndex]?.source.height}
      alt=""
      draggable="false"
      decoding="async"
      style:width={size ? `${size.width}px` : undefined}
      style:height={size ? `${size.height}px` : undefined}
      class="h-auto max-h-full w-auto max-w-full object-contain select-none"
    />
  </div>
{/snippet}

{#snippet tiledCanvas(url: string)}
  <!-- Starts once opening has finished, so the canvas never shows beneath the
       moving image. -->
  {#if !lightboxTransitioning}
    <LightboxTiles
      {url}
      {view}
      restImage={lightboxImageSize}
      stage={{ width: stageWidth, height: stageHeight }}
    />
  {/if}
{/snippet}

<style>
  .lightbox {
    --color-black: #000;
    --color-white: #fff;
  }
</style>

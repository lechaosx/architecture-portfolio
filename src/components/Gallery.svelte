<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    devicePixelRatio,
    innerHeight,
    innerWidth,
  } from 'svelte/reactivity/window';
  import type OpenSeadragon from 'openseadragon';
  import type { ResponsiveImage } from '../images';
  import { ui, type Lang } from '../i18n';
  import {
    CONTROL_SIZE,
    PHONE_WIDTH,
    cardView,
    clampPan,
    clampScale,
    comparisonSetIndexes,
    containedImageSize,
    deepZoomViewport,
    displayedSwipeOffset,
    doubleTapScale,
    galleryImageHash,
    galleryImageIndex,
    imageText,
    lightboxAreas,
    lightboxImageUrl,
    nativeZoomScale,
    panForPinch,
    panForZoom,
    scaleFromPinch,
    scaleFromWheel,
    scrubProgress,
    settleDuration,
    sharedMaximumScale,
    swipeDirection,
    textColumnLimit,
    zoomFloor,
    type GalleryImage,
    type Point,
    type ZoomRange,
  } from './gallery';
  import LightboxVerso from './LightboxVerso.svelte';
  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY island that ships JS to the browser.
  let { images, responsiveImages }: {
    images: GalleryImage[];
    responsiveImages: (ResponsiveImage | undefined)[];
  } = $props();

  const galleryHistoryKey = 'architecturePortfolioGallery';
  const blendDuration = 180;
  const slideDuration = 180;
  const flipDuration = 560;
  const reducedFlipDuration = 150;
  const keyZoomStep = 1.25;
  const tapSlop = 10;
  const doubleTapDelay = 300;
  const doubleTapDistance = 30;

  let open = $state(false);
  let lang = $state<Lang>('en');
  let index = $state(0);
  let scale = $state(1);
  let pan = $state<Point>({ x: 0, y: 0 });
  let showDescription = $state(false);
  // A drawing without responsive variants reveals its size once it loads.
  let loadedSize = $state<{ src: string; width: number; height: number }>();
  // A move towards a variant of the current card: `progress` 1 shows `target`.
  let change = $state<{ target: number; progress: number }>();
  // How long the card's next turn or blend takes; 0 moves it at once.
  let cardDuration = $state(0);
  // Measured and scrolled by the backs (LightboxVerso) and bound up here.
  let cardScale = $state(1);
  let descriptionScroll = $state(0);
  let incomingCardScale = $state(1);
  let dragging = $state(false);
  let swipeOffset = $state(0);
  let swipeDeltaX = 0;
  let swipeAnimating = $state(false);
  let lightboxTransitioning = $state(false);
  let navigating = $state(false);
  let reducedMotion = $state(false);
  let closing = false;
  let savedScrollRestoration: ScrollRestoration | undefined;
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let pixelRatio = $derived(devicePixelRatio.current ?? 1);
  let stage = $state<HTMLDivElement>()!;
  let image = $state<HTMLImageElement>()!;
  let dialog = $state<HTMLDialogElement>()!;
  let closeButton = $state<HTMLButtonElement>()!;
  let setStrip = $state<HTMLElement>();
  let trigger: HTMLButtonElement | undefined;
  let thumbnailButtons: HTMLButtonElement[] = [];
  let deepZoomElement = $state<HTMLDivElement>();
  let deepZoomViewer: OpenSeadragon.Viewer | undefined;
  let dragStart: Point | null = null;
  let pointerSwipeStart: Point | null = null;
  let swipeDeltaY = 0;
  let navigationRun = 0;
  let stripRun = 0;
  let touchStart: Point | null = null;
  let touchPanStart: Point | null = null;
  let tapStart: Point | null = null;
  let lastTap: { point: Point; time: number } | null = null;
  let pinchStart: {
    distance: number;
    scale: number;
    center: Point;
    pan: Point;
  } | null = null;
  let areas = $derived(
    lightboxAreas({ width: stageWidth, height: stageHeight }),
  );
  let lightboxSrc = $derived(imageUrl(index));
  let lightboxImageSize = $derived(restImageSize(index));
  let originalSrc = $derived(
    responsiveImages[index]?.originalUrl ?? images[index]?.image,
  );
  let deepZoom = $derived(responsiveImages[index]?.deepZoom);
  let previousIndex = $derived(
    images.length ? (index - 1 + images.length) % images.length : 0,
  );
  let nextIndex = $derived(images.length ? (index + 1) % images.length : 0);
  let previousPreviewSrc = $derived(previewUrl(previousIndex));
  let nextPreviewSrc = $derived(previewUrl(nextIndex));
  let deepZoomPreviewSrc = $derived(previewUrl(index));
  let comparisonIndexes = $derived(comparisonSetIndexes(images, index));
  let title = $derived(imageText(images[index], 'title', lang));
  let description = $derived(imageText(images[index], 'description', lang));
  let flipped = $derived(showDescription && Boolean(cardRest));
  let phone = $derived(stageWidth <= PHONE_WIDTH);
  let columnLimit = $derived(textColumnLimit(stageWidth, areas.band));
  // The back takes the front's rest size, so it exists only once that is known.
  let cardRest = $derived(description ? lightboxImageSize : undefined);
  // Where the back shows its card; the flip moves the drawing to and from it.
  let backView = $derived(
    cardRest
      ? cardView(cardRest, areas.rest, cardScale, descriptionScroll)
      : { scale: 1, y: 0 },
  );
  // 1 shows the text side, 0 the drawing; a move to a variant from the text
  // side turns the card back as it blends.
  let turn = $derived(flipped ? 1 - (change?.progress ?? 0) : 0);
  let setStripIndexes = $derived(
    comparisonIndexes.length ? comparisonIndexes : title ? [index] : [],
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
    const nav = setStrip;
    const selectedIndex = index;
    if (!open || !nav || !setStripIndexes.includes(selectedIndex)) return;
    void tick().then(() => {
      if (!open || nav !== setStrip || index !== selectedIndex) return;
      const selected = nav.querySelector<HTMLElement>('[aria-current="true"]');
      if (!selected) return;
      nav.scrollTo({
        left:
          selected.offsetLeft -
          (nav.clientWidth - selected.offsetWidth) / 2,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
  });
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
      const nextScale = clampScale(scale, range);
      setView(
        nextScale,
        restImage ? clampPan(pan, nextScale, restImage, bounds) : pan,
      );
    });
  });
  $effect(() => {
    if (!lightboxTransitioning) return;
    const preventGesture = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const options = { capture: true, passive: false } as const;
    window.addEventListener('wheel', preventGesture, options);
    window.addEventListener('touchmove', preventGesture, options);
    return () => {
      window.removeEventListener('wheel', preventGesture, options);
      window.removeEventListener('touchmove', preventGesture, options);
    };
  });
  $effect(() => {
    const descriptor = deepZoom;
    const element = deepZoomElement;
    if (!open || !descriptor || !element || lightboxTransitioning) return;

    let cancelled = false;
    let viewer: OpenSeadragon.Viewer | undefined;

    void import('openseadragon').then(({ default: createViewer }) => {
      if (cancelled) return;
      // OpenSeadragon caches this module-wide, including while no viewer exists.
      Object.assign(createViewer, {
        pixelDensityRatio: createViewer.getCurrentPixelDensityRatio(),
      });
      const createdViewer = createViewer({
        element,
        tileSources: descriptor.url,
        mouseNavEnabled: false,
        keyboardNavEnabled: false,
        tabIndex: -1,
        showNavigationControl: false,
        showNavigator: false,
        autoResize: false,
        minPixelRatio: 0.5,
        animationTime: 0,
        immediateRender: true,
      });
      viewer = createdViewer;
      deepZoomViewer = createdViewer;
      createdViewer.addHandler('open', () => syncDeepZoomViewport(scale, pan));
    });

    return () => {
      cancelled = true;
      viewer?.destroy();
      if (deepZoomViewer === viewer) deepZoomViewer = undefined;
    };
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

    const linkedImage = galleryImageIndex(location.hash, images.length);
    if (linkedImage !== undefined) {
      suspendScrollRestoration();
      const baseUrl = `${location.pathname}${location.search}`;
      const initialState = history.state;
      history.replaceState(initialState, '', baseUrl);
      history.pushState(galleryHistoryState(initialState), '', galleryImageHash(linkedImage));
      void showFromHistory(linkedImage);
    }
    return () => {
      resumeScrollRestoration();
      for (const { button, handler } of triggerHandlers) {
        button.removeEventListener('click', handler);
      }
      languageObserver.disconnect();
      motionQuery.removeEventListener('change', syncMotionPreference);
    };
  });

  function onpopstate() {
    const imageIndex = galleryImageIndex(location.hash, images.length);
    if (!open && imageIndex === undefined) return;
    suspendScrollRestoration();
    if (imageIndex === undefined) {
      void closeFromHistory().finally(resumeScrollRestoration);
    } else {
      void showFromHistory(imageIndex);
    }
  }

  function resetView() {
    setView(1, { x: 0, y: 0 });
    endDrag();
  }

  /**
   * Ends any live drag, since a change of image takes over from it, and
   * returns a strip the drag had moved.
   */
  function endDrag() {
    dragging = false;
    dragStart = null;
    pointerSwipeStart = null;
    touchStart = null;
    touchPanStart = null;
    tapStart = null;
    pinchStart = null;
    swipeDeltaY = 0;
    void snapBack();
  }

  function previewUrl(imageIndex: number) {
    return imageUrl(imageIndex, 1);
  }

  function imageUrl(imageIndex: number, imageScale = scale) {
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

  function setStripLabel(imageIndex: number) {
    return (
      imageText(images[imageIndex], 'title', lang) ??
      `${ui[lang].image} ${imageIndex + 1}`
    );
  }

  function transitionTargetIsUnobscured(target: HTMLElement) {
    const bounds = target.getBoundingClientRect();
    const headerBounds = document
      .querySelector<HTMLElement>('body > header')
      ?.getBoundingClientRect();
    const overlapsHeader =
      headerBounds &&
      bounds.left < headerBounds.right &&
      bounds.right > headerBounds.left &&
      bounds.top < headerBounds.bottom &&
      bounds.bottom > headerBounds.top;
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.left >= 0 &&
      bounds.top >= 0 &&
      bounds.right <= window.innerWidth &&
      bounds.bottom <= window.innerHeight &&
      !overlapsHeader
    );
  }

  function slideTransform(position: number) {
    return `translate3d(${swipeOffset + position * stageWidth}px, 0, 0)`;
  }

  async function show(i: number, source: HTMLButtonElement) {
    trigger = source;
    source.blur();
    suspendScrollRestoration();
    history.pushState(galleryHistoryState(history.state), '', galleryImageHash(i));
    if (reducedMotion || !document.startViewTransition) {
      await showFromHistory(i);
      return;
    }

    lightboxTransitioning = true;
    const morphImage = transitionTargetIsUnobscured(source);
    const sourceImage = morphImage ? source.querySelector('img') : null;
    const sourceScale = sourceImage
      ? sourceImage.getBoundingClientRect().width / source.clientWidth
      : 1;
    if (sourceImage) {
      sourceImage.style.transition = 'none';
      sourceImage.style.scale = String(sourceScale);
    }
    if (morphImage) {
      document.documentElement.style.setProperty(
        '--lightbox-source-scale',
        String(sourceScale),
      );
      source.style.viewTransitionName = 'lightbox-image';
    }
    let transitionImage: HTMLImageElement | undefined;
    try {
      const transition = document.startViewTransition({
        update: async () => {
          await showFromHistory(i);
          transitionImage = image;
          if (!morphImage) transitionImage.style.viewTransitionName = 'none';
          await image.decode();
          source.style.viewTransitionName = '';
        },
        types: ['lightbox-open'],
      });
      await transition.finished;
    } catch {
      source.style.viewTransitionName = '';
      if (!open) await showFromHistory(i);
    } finally {
      sourceImage?.style.removeProperty('transition');
      sourceImage?.style.removeProperty('scale');
      document.documentElement.style.removeProperty('--lightbox-source-scale');
      transitionImage?.style.removeProperty('view-transition-name');
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
    if (isGalleryHistoryEntry()) {
      suspendScrollRestoration();
      history.back();
      return;
    }
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    void closeFromHistory().finally(resumeScrollRestoration);
  }
  async function closeFromHistory() {
    if (!open) return;
    const thumbnail = thumbnailButtons[index];
    if (
      reducedMotion ||
      !thumbnail ||
      !image ||
      !document.startViewTransition
    ) {
      await hideLightbox();
      return;
    }

    const morphImage =
      scale === 1 && !flipped && transitionTargetIsUnobscured(thumbnail);
    lightboxTransitioning = true;
    const transitionImage = image;
    if (!morphImage) transitionImage.style.viewTransitionName = 'none';
    try {
      const transition = document.startViewTransition({
        update: async () => {
          await hideLightbox();
          if (morphImage) thumbnail.style.viewTransitionName = 'lightbox-image';
        },
        types: ['lightbox-close'],
      });
      await transition.finished;
    } catch {
      await hideLightbox();
    } finally {
      thumbnail.style.viewTransitionName = '';
      transitionImage.style.removeProperty('view-transition-name');
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
    preload.src = blendUrl(target);
    try {
      await preload.decode();
    } catch {}
  }

  function blendUrl(target: number) {
    return responsiveImages[target]?.deepZoom
      ? previewUrl(target)
      : imageUrl(target);
  }

  function showImage(target: number) {
    index = target;
    showDrawingSide();
    history.replaceState(
      galleryHistoryState(history.state),
      '',
      galleryImageHash(index),
    );
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
    } else if (['+', '=', '-', '0'].includes(e.key)) {
      if (
        flipped ||
        lightboxTransitioning ||
        change ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      const step = e.key === '-' ? 1 / keyZoomStep : keyZoomStep;
      zoomTo(e.key === '0' ? 1 : clampScale(scale * step, zoomRange), {
        x: 0,
        y: 0,
      });
    } else if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
        e.key,
      ) &&
      !(e.target instanceof Element && e.target.matches('[data-lightbox-scroll]'))
    ) {
      e.preventDefault();
    }
  }

  function galleryHistoryState(state: unknown) {
    return {
      ...(state !== null && typeof state === 'object' ? state : {}),
      [galleryHistoryKey]: true,
    };
  }

  function isGalleryHistoryEntry() {
    return Boolean(
      history.state &&
        typeof history.state === 'object' &&
        history.state[galleryHistoryKey] === true,
    );
  }

  function suspendScrollRestoration() {
    if (savedScrollRestoration !== undefined) return;
    savedScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
  }

  function resumeScrollRestoration() {
    if (savedScrollRestoration === undefined) return;
    history.scrollRestoration = savedScrollRestoration;
    savedScrollRestoration = undefined;
  }

  function cancelNavigation() {
    navigationRun += 1;
    change = undefined;
    navigating = false;
    swipeAnimating = false;
    swipeOffset = 0;
    swipeDeltaX = 0;
  }

  /** Eases the strip back to rest, unless a slide takes the strip over meanwhile. */
  async function snapBack() {
    swipeDeltaX = 0;
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

  function releaseDrag(deltaX: number, deltaY: number) {
    const direction = swipeDirection(deltaX, deltaY);
    if (direction === 0) void settleDrag();
    else void changeTo(direction > 0 ? nextIndex : previousIndex, direction);
  }

  function settleDrag() {
    return change ? cancelBlend() : snapBack();
  }

  function constrainedPan(nextPan: Point, nextScale = scale) {
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

  // OpenSeadragon only mirrors the shared scale and pan. Its own constraints and
  // auto-resize are off because either would move the view away from the
  // component's clamp, so the stage size is handed to it here.
  function syncDeepZoomViewport(nextScale: number, nextPan: Point) {
    const viewer = deepZoomViewer;
    const imageSize = lightboxImageSize;
    if (!viewer || !imageSize) return;
    const viewport = viewer.viewport;
    const containerSize = viewport.getContainerSize();
    if (containerSize.x !== stageWidth || containerSize.y !== stageHeight) {
      containerSize.x = stageWidth;
      containerSize.y = stageHeight;
      viewport.resize(containerSize);
    }
    const target = deepZoomViewport(
      viewport.getHomeBounds().getCenter(),
      stageWidth,
      imageSize.width * nextScale,
      nextPan,
    );
    const center = viewport.getCenter();
    center.x = target.center.x;
    center.y = target.center.y;
    viewport.zoomTo(target.zoom, undefined, true);
    viewport.panTo(center, true);
  }

  function setView(nextScale: number, nextPan: Point) {
    scale = nextScale;
    pan = nextPan;
    syncDeepZoomViewport(nextScale, nextPan);
  }

  /** Scales to `nextScale` while keeping the image point under `point` in place. */
  function zoomTo(nextScale: number, point: Point) {
    setView(
      nextScale,
      constrainedPan(panForZoom(pan, scale, nextScale, point), nextScale),
    );
  }

  function fromStageCenter(clientPoint: Point): Point {
    const bounds = stage.getBoundingClientRect();
    return {
      x: clientPoint.x - (bounds.left + bounds.width / 2),
      y: clientPoint.y - (bounds.top + bounds.height / 2),
    };
  }

  function onwheel(e: WheelEvent) {
    // The text on the back scrolls natively.
    if (flipped) return;
    e.preventDefault();
    if (lightboxTransitioning || change) return;
    const delta =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? e.deltaY * 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? e.deltaY * stage.clientHeight
          : e.deltaY;
    zoomTo(
      scaleFromWheel(scale, delta, zoomRange),
      fromStageCenter({ x: e.clientX, y: e.clientY }),
    );
  }

  function ondblclick(e: MouseEvent) {
    if (flipped || lightboxTransitioning || change || navigating) return;
    zoomTo(
      doubleTapScale(scale, zoomRange),
      fromStageCenter({ x: e.clientX, y: e.clientY }),
    );
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

  function onpointerdown(e: PointerEvent) {
    if (
      lightboxTransitioning ||
      e.pointerType !== 'mouse' ||
      e.button !== 0 ||
      navigating ||
      // A mouse selects and scrolls the text instead of dragging the strip.
      (e.target instanceof Element &&
        Boolean(e.target.closest('[data-lightbox-scroll]')))
    ) {
      return;
    }
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    dragging = true;
    if (scale <= 1 || flipped) {
      swipeAnimating = false;
      pointerSwipeStart = { x: e.clientX, y: e.clientY };
      swipeDeltaX = 0;
      swipeDeltaY = 0;
    } else {
      dragStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }

  function onpointermove(e: PointerEvent) {
    if (pointerSwipeStart) {
      swipeDeltaX = e.clientX - pointerSwipeStart.x;
      swipeDeltaY = e.clientY - pointerSwipeStart.y;
      dragAtRest(swipeDeltaX);
      return;
    }
    if (!dragging || !dragStart) return;
    setView(
      scale,
      constrainedPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }),
    );
  }

  function onpointerup(e: PointerEvent) {
    if (!dragging) return;
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (pointerSwipeStart) {
      const [deltaX, deltaY] = [swipeDeltaX, swipeDeltaY];
      pointerSwipeStart = null;
      swipeDeltaX = 0;
      swipeDeltaY = 0;
      dragging = false;
      releaseDrag(deltaX, deltaY);
      return;
    }
    dragging = false;
    dragStart = null;
  }

  function onpointercancel(e: PointerEvent) {
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    dragging = false;
    dragStart = null;
    pointerSwipeStart = null;
    swipeDeltaX = 0;
    swipeDeltaY = 0;
    void settleDrag();
  }

  function ontouchstart(e: TouchEvent) {
    if (lightboxTransitioning || navigating) return;
    if (e.touches.length === 2 && !flipped) {
      swipeAnimating = false;
      swipeOffset = 0;
      swipeDeltaX = 0;
      change = undefined;
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
      tapStart = null;
      return;
    }

    if (e.touches.length === 1) {
      const point = touchPoint(e.touches[0]);
      const swipes = scale <= 1 || flipped;
      swipeAnimating = false;
      tapStart = flipped ? null : point;
      touchStart = swipes && !selectingText() ? point : null;
      swipeDeltaX = 0;
      touchPanStart = swipes ? null : { x: point.x - pan.x, y: point.y - pan.y };
      return;
    }

    resetTouchGesture();
  }

  function ontouchmove(e: TouchEvent) {
    if (e.touches.length === 2 && pinchStart) {
      const first = touchPoint(e.touches[0]);
      const second = touchPoint(e.touches[1]);
      const nextScale = scaleFromPinch(
        pinchStart.scale,
        pinchStart.distance,
        touchDistance(first, second),
        zoomRange,
      );
      setView(
        nextScale,
        constrainedPan(
          panForPinch(
            pinchStart.pan,
            pinchStart.scale,
            nextScale,
            pinchStart.center,
            touchCenter(first, second),
          ),
          nextScale,
        ),
      );
      return;
    }

    if (e.touches.length === 1 && touchPanStart) {
      const point = touchPoint(e.touches[0]);
      setView(
        scale,
        constrainedPan({
          x: point.x - touchPanStart.x,
          y: point.y - touchPanStart.y,
        }),
      );
      return;
    }

    if (e.touches.length === 1 && touchStart) {
      if (selectingText()) {
        resetTouchGesture();
        return;
      }
      const point = touchPoint(e.touches[0]);
      swipeDeltaX = point.x - touchStart.x;
      swipeDeltaY = point.y - touchStart.y;
      // On the text side a mostly vertical drag may still become a native scroll.
      const follows = !flipped || Math.abs(swipeDeltaX) > Math.abs(swipeDeltaY);
      dragAtRest(follows ? swipeDeltaX : 0);
      return;
    }

    if (e.touches.length !== 1) touchStart = null;
  }

  function ontouchend(e: TouchEvent) {
    if (recordTap(e)) {
      // Keeps the browser from also turning the taps into a dblclick.
      e.preventDefault();
      const point = touchPoint(e.changedTouches[0]);
      resetTouchGesture();
      zoomTo(doubleTapScale(scale, zoomRange), fromStageCenter(point));
      return;
    }

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
    const [deltaX, deltaY] = [swipeDeltaX, swipeDeltaY];
    touchStart = null;
    swipeDeltaX = 0;
    swipeDeltaY = 0;
    releaseDrag(deltaX, deltaY);
  }

  // Scrolling the text vertically is not a swipe.
  function ontextscroll() {
    if (touchStart) resetTouchGesture();
  }

  function selectingText() {
    const selection = getSelection();
    return Boolean(
      selection &&
        !selection.isCollapsed &&
        stage.contains(selection.anchorNode),
    );
  }

  /** Returns whether this touch completes a double tap. */
  function recordTap(e: TouchEvent) {
    const start = tapStart;
    if (!start || e.touches.length || e.changedTouches.length !== 1) {
      return false;
    }
    tapStart = null;
    const point = touchPoint(e.changedTouches[0]);
    if (touchDistance(start, point) >= tapSlop) return false;
    const previous = lastTap;
    const double =
      previous !== null &&
      e.timeStamp - previous.time < doubleTapDelay &&
      touchDistance(previous.point, point) < doubleTapDistance;
    lastTap = double ? null : { point, time: e.timeStamp };
    return double;
  }

  function touchPoint(touch: Touch): Point {
    return { x: touch.clientX, y: touch.clientY };
  }

  function touchDistance(first: Point, second: Point) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function touchCenter(first: Point, second: Point): Point {
    return fromStageCenter({
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    });
  }

  function resetTouchGesture() {
    touchStart = null;
    touchPanStart = null;
    tapStart = null;
    pinchStart = null;
    swipeDeltaX = 0;
    swipeDeltaY = 0;
    void settleDrag();
  }
</script>

<svelte:window {onkeydown} {onpopstate} />

{#if open}
  <dialog
    bind:this={dialog}
    data-gallery-lightbox
    class="lightbox fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-black/90 p-0 text-white"
    class:lightbox-flipped={flipped}
    class:lightbox-phone={phone}
    style:--lightbox-gap={`${areas.gap}px`}
    style:--lightbox-band={`${areas.band}px`}
    style:--lightbox-control={`${CONTROL_SIZE}px`}
    style:--lightbox-card-duration={`${cardDuration}ms`}
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
      style:cursor={dragging ? 'grabbing' : 'grab'}
      onscrollcapture={ontextscroll}
      {onwheel}
      {ondblclick}
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onpointercancel}
      {ontouchstart}
      {ontouchmove}
      {ontouchend}
      ontouchcancel={resetTouchGesture}
    >
      {#if images.length > 1}
        {@const size = restImageSize(previousIndex)}
        <div
          class="lightbox-slide-previous pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          style:transform={slideTransform(-1)}
          style:transition={slideTransition}
          aria-hidden="true"
        >
          <img
            src={previousPreviewSrc}
            width={responsiveImages[previousIndex]?.source.width}
            height={responsiveImages[previousIndex]?.source.height}
            alt=""
            draggable="false"
            decoding="async"
            style:width={size ? `${size.width}px` : undefined}
            style:height={size ? `${size.height}px` : undefined}
            class="h-auto max-h-full w-auto max-w-full object-contain select-none"
          />
        </div>
      {/if}
      <div
        class="lightbox-slide-current absolute inset-0 overflow-hidden"
        style:transform={slideTransform(0)}
        style:transition={slideTransition}
      >
        <div
          data-lightbox-sheet
          class="lightbox-sheet absolute inset-0"
          style:--lightbox-turn={turn}
          style:--lightbox-blend={change?.progress ?? 0}
          style:--drawing-scale={scale}
          style:--drawing-x={`${pan.x}px`}
          style:--drawing-y={`${pan.y}px`}
          style:--card-scale={backView.scale}
          style:--card-y={`${backView.y}px`}
        >
          <div
            class="lightbox-front lightbox-face flex items-center justify-center"
            class:lightbox-away={turn === 1}
            inert={flipped}
          >
            {#if deepZoom}
              <img
                bind:this={image}
                src={deepZoomPreviewSrc}
                width={responsiveImages[index]?.source.width}
                height={responsiveImages[index]?.source.height}
                alt=""
                draggable="false"
                style:width={lightboxImageSize
                  ? `${lightboxImageSize.width}px`
                  : undefined}
                style:height={lightboxImageSize
                  ? `${lightboxImageSize.height}px`
                  : undefined}
                class:lightbox-image={scale === 1}
                class="lightbox-at-view absolute h-auto max-h-full w-auto max-w-full object-contain select-none"
                onload={() => (pan = constrainedPan(pan))}
              />
              <div
                bind:this={deepZoomElement}
                class="lightbox-from-drawing absolute inset-0"
              ></div>
            {:else}
              <img
                bind:this={image}
                src={lightboxSrc}
                width={responsiveImages[index]?.source.width}
                height={responsiveImages[index]?.source.height}
                alt=""
                draggable="false"
                style:width={lightboxImageSize
                  ? `${lightboxImageSize.width}px`
                  : undefined}
                style:height={lightboxImageSize
                  ? `${lightboxImageSize.height}px`
                  : undefined}
                class:lightbox-image={scale === 1}
                class="lightbox-at-view h-auto max-h-full w-auto max-w-full object-contain select-none"
                onload={() => {
                  loadedSize = {
                    src: images[index].image,
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  };
                  pan = constrainedPan(pan);
                }}
              />
            {/if}
            {#if change}
              {@const size = restImageSize(change.target)}
              <!-- Unbacked: until the variant has loaded, the current drawing
                   shows through undimmed. -->
              <div
                class="lightbox-incoming absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <img
                  src={blendUrl(change.target)}
                  width={responsiveImages[change.target]?.source.width}
                  height={responsiveImages[change.target]?.source.height}
                  alt=""
                  draggable="false"
                  style:width={size ? `${size.width}px` : undefined}
                  style:height={size ? `${size.height}px` : undefined}
                  class="lightbox-at-view h-auto max-h-full w-auto max-w-full object-contain select-none"
                />
              </div>
            {/if}
          </div>
          {#if description && cardRest}
            {@const incomingText = change
              ? imageText(images[change.target], 'description', lang)
              : undefined}
            {@const incomingRest = change && restImageSize(change.target)}
            <div
              class="lightbox-back lightbox-face"
              class:lightbox-away={turn === 0}
              inert={!flipped}
            >
              <div
                class="absolute inset-0"
                class:lightbox-outgoing={change && !incomingText}
              >
                {#key index}
                  <LightboxVerso
                    {title}
                    {description}
                    {lang}
                    restImage={cardRest}
                    {columnLimit}
                    bind:cardScale
                    bind:scrollTop={descriptionScroll}
                  />
                {/key}
              </div>
              {#if change && incomingText && incomingRest}
                {@const incomingView = cardView(
                  incomingRest,
                  areas.rest,
                  incomingCardScale,
                  0,
                )}
                <div
                  class="lightbox-incoming absolute inset-0"
                  style:--card-scale={incomingView.scale}
                  style:--card-y={`${incomingView.y}px`}
                  aria-hidden="true"
                  inert
                >
                  <LightboxVerso
                    title={imageText(images[change.target], 'title', lang)}
                    description={incomingText}
                    {lang}
                    restImage={incomingRest}
                    {columnLimit}
                    bind:cardScale={incomingCardScale}
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
      {#if images.length > 1}
        {@const size = restImageSize(nextIndex)}
        <div
          class="lightbox-slide-next pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          style:transform={slideTransform(1)}
          style:transition={slideTransition}
          aria-hidden="true"
        >
          <img
            src={nextPreviewSrc}
            width={responsiveImages[nextIndex]?.source.width}
            height={responsiveImages[nextIndex]?.source.height}
            alt=""
            draggable="false"
            decoding="async"
            style:width={size ? `${size.width}px` : undefined}
            style:height={size ? `${size.height}px` : undefined}
            class="h-auto max-h-full w-auto max-w-full object-contain select-none"
          />
        </div>
      {/if}
    </div>

    <div
      class="pointer-events-none absolute inset-x-(--lightbox-gap) top-(--lightbox-gap) flex items-start gap-2 *:pointer-events-auto"
    >
      {#if setStripIndexes.length}
        <nav
          bind:this={setStrip}
          aria-label={ui[lang].imageSet}
          class="no-scrollbar relative -m-1 min-w-0 touch-pan-x overflow-x-auto p-1"
          data-lightbox-scroll
          onwheel={onSetStripWheel}
        >
          <div class="flex w-max">
            {#each setStripIndexes as setIndex}
              <button
                type="button"
                class="lightbox-control lightbox-set-option px-3 text-sm"
                aria-current={setIndex === index ? 'true' : undefined}
                disabled={setIndex === index}
                onclick={() => void changeTo(setIndex, Math.sign(setIndex - index))}
              >
                {setStripLabel(setIndex)}
              </button>
            {/each}
          </div>
        </nav>
      {/if}
      <button
        bind:this={closeButton}
        type="button"
        class="lightbox-control ml-auto text-2xl leading-none"
        onclick={requestClose}
        aria-label={ui[lang].close}>×</button
      >
    </div>
    <button
      type="button"
      class="lightbox-control lightbox-arrow left-(--lightbox-gap)"
      onclick={prev}
      aria-label={ui[lang].previousImage}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M15.5 5l-7 7 7 7" />
      </svg>
    </button>
    <button
      type="button"
      class="lightbox-control lightbox-arrow right-(--lightbox-gap)"
      onclick={next}
      aria-label={ui[lang].nextImage}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M8.5 5l7 7-7 7" />
      </svg>
    </button>
    {#if cardRest}
      <button
        type="button"
        class="lightbox-control absolute bottom-(--lightbox-gap) left-(--lightbox-gap)"
        aria-pressed={flipped}
        aria-label={ui[lang].showDescription}
        onclick={toggleDescription}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="h-5 w-5"
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
    <div
      class="absolute right-(--lightbox-gap) bottom-(--lightbox-gap) flex gap-2"
    >
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
        aria-label={`${ui[lang].openOriginal} (${index + 1} ${ui[lang].positionOf} ${images.length})`}
      >
        {index + 1} / {images.length}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M14 5h5v5M19 5l-9 9" />
          <path d="M11 5H5v14h14v-6" />
        </svg>
      </a>
    </div>
    <p role="status" aria-atomic="true" class="sr-only">
      {index + 1} / {images.length}
    </p>
  </dialog>
{/if}

<style>
  .lightbox {
    --color-black: #000;
    --color-white: #fff;
    --lightbox-card-easing: cubic-bezier(0.45, 0.05, 0.2, 1);
  }

  .lightbox-control {
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

  .lightbox-arrow {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
  }

  /* The current image is a card: its drawing on the front and its description
     on the back. --lightbox-turn is 1 with the text side up and 0 with the
     drawing up; the card turns by it, and every face is drawn at the shown
     view between the drawing's view and the back's card view, so a flip also
     zooms between them. --lightbox-blend shows a variant over both faces.
     Turn and blend share one duration and easing, so they stay in step.
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

  /* On phones the edge arrows step aside for the text; dragging the text
     sideways still changes image. */
  .lightbox-phone.lightbox-flipped .lightbox-arrow {
    visibility: hidden;
  }
</style>

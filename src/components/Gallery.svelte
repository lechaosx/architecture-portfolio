<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    devicePixelRatio,
    innerHeight,
    innerWidth,
  } from 'svelte/reactivity/window';
  import type OpenSeadragon from 'openseadragon';
  import type { ResponsiveImage } from '../images';
  import { ui, type Lang } from '../i18n';
  import {
    clampPan,
    comparisonSetIndexes,
    containedImageSize,
    deepZoomViewport,
    displayedSwipeOffset,
    galleryImageHash,
    galleryImageIndex,
    hasCaption,
    lightboxImageUrl,
    nativeZoomScale,
    panForPinch,
    panForZoom,
    scaleFromPinch,
    scaleFromWheel,
    sharedMaximumScale,
    swipeDirection,
    type GalleryImage,
    type Point,
  } from './gallery';
  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY component that ships JS to the browser.
  let { images, responsiveImages }: {
    images: GalleryImage[];
    responsiveImages: (ResponsiveImage | undefined)[];
  } = $props();

  const galleryHistoryKey = 'architecturePortfolioGallery';
  const comparisonDuration = 180;
  const slideDuration = 180;

  let open = $state(false);
  let lang = $state<Lang>('en');
  let index = $state(0);
  let scale = $state(1);
  let pan = $state<Point>({ x: 0, y: 0 });
  let dragging = $state(false);
  let swipeOffset = $state(0);
  let swipeDeltaX = 0;
  let swipeAnimating = $state(false);
  let lightboxTransitioning = $state(false);
  let comparisonTransitioning = $state(false);
  let comparisonPrevious = $state<{
    src: string;
    sourceWidth?: number;
    sourceHeight?: number;
    width?: number;
    height?: number;
    scale: number;
    pan: Point;
  }>();
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
  let comparisonNav = $state<HTMLElement>();
  let trigger: HTMLButtonElement | undefined;
  let thumbnailButtons: HTMLButtonElement[] = [];
  let deepZoomElement = $state<HTMLDivElement>();
  let deepZoomViewer: OpenSeadragon.Viewer | undefined;
  let dragStart: Point | null = null;
  let pointerSwipeStart: Point | null = null;
  let swipeDeltaY = 0;
  let comparisonRun = 0;
  let navigationRun = 0;
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
          pixelRatio,
        )
      : images[index]?.image,
  );
  let lightboxImageSize = $derived.by(() => {
    const responsiveImage = responsiveImages[index];
    return responsiveImage && stageWidth > 0 && stageHeight > 0
      ? containedImageSize(responsiveImage.source, {
          width: stageWidth,
          height: stageHeight,
        })
      : undefined;
  });
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
  let slideTransition = $derived(
    swipeAnimating
      ? `transform ${slideDuration}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : 'none',
  );
  $effect(() => {
    const nav = comparisonNav;
    const selectedIndex = index;
    if (!open || !nav || !comparisonIndexes.includes(selectedIndex)) return;
    void tick().then(() => {
      if (!open || nav !== comparisonNav || index !== selectedIndex) return;
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
        constrainDuringPan: true,
        visibilityRatio: 1,
        maxZoomPixelRatio: 1,
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
    deepZoomViewer?.viewport.goHome(true);
    scale = 1;
    pan = { x: 0, y: 0 };
    dragging = false;
    dragStart = null;
    pointerSwipeStart = null;
    touchStart = null;
    touchPanStart = null;
    pinchStart = null;
  }

  function previewUrl(imageIndex: number) {
    const responsiveImage = responsiveImages[imageIndex];
    return responsiveImage
      ? lightboxImageUrl(
          responsiveImage,
          { width: stageWidth, height: stageHeight },
          1,
          pixelRatio,
        )
      : images[imageIndex]?.image;
  }

  function imageUrl(imageIndex: number, imageScale = scale) {
    const responsiveImage = responsiveImages[imageIndex];
    return responsiveImage
      ? lightboxImageUrl(
          responsiveImage,
          { width: stageWidth, height: stageHeight },
          imageScale,
          pixelRatio,
        )
      : images[imageIndex]?.image;
  }

  function comparisonLabel(imageIndex: number) {
    const comparisonImage = images[imageIndex];
    const title =
      lang === 'cs' ? comparisonImage?.title_cs : comparisonImage?.title_en;
    return title?.trim() || `${ui[lang].image} ${imageIndex + 1}`;
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
    resetView();
    stageWidth = innerWidth.current ?? 0;
    stageHeight = (innerHeight.current ?? 0) * 0.85;
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

    const morphImage = scale === 1 && transitionTargetIsUnobscured(thumbnail);
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
  async function go(offset: number) {
    if (closing || navigating || comparisonTransitioning || images.length < 2) {
      if (!navigating) void snapBack();
      return;
    }
    const run = ++navigationRun;
    navigating = true;
    const direction = Math.sign(offset);

    if (!reducedMotion) {
      swipeAnimating = true;
      swipeOffset = -direction * (stage?.clientWidth || window.innerWidth);
      await waitForSlide();
      if (run !== navigationRun || !open) return;
    }

    index = (index + offset + images.length) % images.length;
    resetView();
    swipeAnimating = false;
    swipeOffset = 0;
    history.replaceState(
      galleryHistoryState(history.state),
      '',
      galleryImageHash(index),
    );
    navigating = false;
  }
  async function compareTo(nextIndex: number) {
    if (
      nextIndex === index ||
      closing ||
      navigating ||
      comparisonTransitioning ||
      !comparisonIndexes.includes(nextIndex)
    ) {
      return;
    }

    const run = ++comparisonRun;
    comparisonTransitioning = true;
    if (!reducedMotion) {
      const preload = new Image();
      preload.src = responsiveImages[nextIndex]?.deepZoom
        ? previewUrl(nextIndex)
        : imageUrl(nextIndex);
      try {
        await preload.decode();
      } catch {}
      if (run !== comparisonRun || !open) return;
      comparisonPrevious = {
        src: image.currentSrc || image.src,
        sourceWidth: responsiveImages[index]?.source.width,
        sourceHeight: responsiveImages[index]?.source.height,
        width: lightboxImageSize?.width,
        height: lightboxImageSize?.height,
        scale,
        pan: { ...pan },
      };
    }

    index = nextIndex;
    history.replaceState(
      galleryHistoryState(history.state),
      '',
      galleryImageHash(index),
    );
    await tick();
    pan = constrainedPan(pan);
    syncDeepZoomViewport(scale, pan);

    if (!reducedMotion) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, comparisonDuration),
      );
    }
    if (run !== comparisonRun) return;
    comparisonPrevious = undefined;
    comparisonTransitioning = false;
  }
  function next() {
    void go(1);
  }
  function prev() {
    void go(-1);
  }
  function onkeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
        e.key,
      )
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
    comparisonRun += 1;
    navigationRun += 1;
    comparisonTransitioning = false;
    comparisonPrevious = undefined;
    navigating = false;
    swipeAnimating = false;
    swipeOffset = 0;
    swipeDeltaX = 0;
  }

  async function snapBack() {
    swipeDeltaX = 0;
    if (swipeOffset === 0) return;
    const run = ++navigationRun;
    const animate = !reducedMotion;
    swipeAnimating = animate;
    swipeOffset = 0;
    if (animate) await waitForSlide();
    if (run === navigationRun) swipeAnimating = false;
  }

  function waitForSlide() {
    return new Promise<void>((resolve) => setTimeout(resolve, slideDuration));
  }

  function constrainedPan(nextPan: Point, nextScale = scale) {
    if (!stage) return nextPan;
    const imageSize = renderedImageSize();
    if (!imageSize) return nextPan;
    return clampPan(
      nextPan,
      nextScale,
      imageSize,
      { width: stage.clientWidth, height: stage.clientHeight },
    );
  }

  function renderedImageSize() {
    if (lightboxImageSize) return lightboxImageSize;
    if (image) return { width: image.clientWidth, height: image.clientHeight };
  }

  function maximumScaleFor(imageIndex: number) {
    const responsiveImage = responsiveImages[imageIndex];
    if (!responsiveImage || !stage?.clientWidth || !stage.clientHeight) return 1;
    const imageSize = containedImageSize(responsiveImage.source, {
      width: stage.clientWidth,
      height: stage.clientHeight,
    });
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

  function syncDeepZoomViewport(nextScale: number, nextPan: Point) {
    const viewer = deepZoomViewer;
    if (!viewer || !stage?.clientWidth) return;
    const viewport = viewer.viewport;
    const homeCenter = viewport.getHomeBounds().getCenter();
    const target = deepZoomViewport(
      viewport.getHomeZoom(),
      homeCenter,
      stage.clientWidth,
      nextScale,
      nextPan,
    );
    const center = viewport.getCenter();
    center.x = target.center.x;
    center.y = target.center.y;
    viewport.zoomTo(target.zoom, undefined, true);
    viewport.panTo(center, true);
    viewport.applyConstraints(true);
  }

  function setView(nextScale: number, nextPan: Point) {
    scale = nextScale;
    pan = nextPan;
    syncDeepZoomViewport(nextScale, nextPan);
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    if (lightboxTransitioning || comparisonTransitioning) return;
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
    setView(
      nextScale,
      constrainedPan(panForZoom(pan, scale, nextScale, pointer), nextScale),
    );
  }

  function preventPageScroll(event: WheelEvent | TouchEvent) {
    if (
      !(
        event.target instanceof Element &&
        event.target.closest(
          '.lightbox-caption-current, .lightbox-comparison-options',
        )
      )
    ) {
      event.preventDefault();
    }
  }

  function onpointerdown(e: PointerEvent) {
    if (
      lightboxTransitioning ||
      comparisonTransitioning ||
      e.pointerType !== 'mouse' ||
      e.button !== 0 ||
      navigating
    ) {
      return;
    }
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    dragging = true;
    if (scale === 1) {
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
      swipeOffset = displayedSwipeOffset(
        swipeDeltaX,
        reducedMotion,
      );
      swipeDeltaY = e.clientY - pointerSwipeStart.y;
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
      const direction = swipeDirection(swipeDeltaX, swipeDeltaY);
      pointerSwipeStart = null;
      swipeDeltaX = 0;
      swipeDeltaY = 0;
      dragging = false;
      if (direction === 0) void snapBack();
      else void go(direction);
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
    void snapBack();
  }

  function ontouchstart(e: TouchEvent) {
    if (lightboxTransitioning || comparisonTransitioning || navigating) return;
    if (e.touches.length === 2) {
      swipeAnimating = false;
      swipeOffset = 0;
      swipeDeltaX = 0;
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
      swipeAnimating = false;
      touchStart = scale === 1 ? point : null;
      swipeDeltaX = 0;
      touchPanStart =
        scale > 1 ? { x: point.x - pan.x, y: point.y - pan.y } : null;
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
        maximumScale(),
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
      const point = touchPoint(e.touches[0]);
      swipeDeltaX = point.x - touchStart.x;
      swipeOffset = displayedSwipeOffset(
        swipeDeltaX,
        reducedMotion,
      );
      swipeDeltaY = point.y - touchStart.y;
      return;
    }

    if (e.touches.length !== 1) touchStart = null;
  }

  function ontouchend(e: TouchEvent) {
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
    const direction = swipeDirection(swipeDeltaX, swipeDeltaY);
    touchStart = null;
    swipeDeltaX = 0;
    swipeDeltaY = 0;
    if (direction === 0) void snapBack();
    else void go(direction);
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
    swipeDeltaX = 0;
    swipeDeltaY = 0;
    void snapBack();
  }
</script>

{#snippet captionContent(caption: GalleryImage)}
  {#if hasCaption(caption)}
    {#if caption.title_cs}
      <p lang="cs" class="text-sm font-medium">{caption.title_cs}</p>
    {/if}
    {#if caption.title_en}
      <p lang="en" class="text-sm font-medium">{caption.title_en}</p>
    {/if}
    {#if caption.description_cs}
      <p lang="cs" class="mt-1 text-sm text-white/70">
        {caption.description_cs}
      </p>
    {/if}
    {#if caption.description_en}
      <p lang="en" class="mt-1 text-sm text-white/70">
        {caption.description_en}
      </p>
    {/if}
  {/if}
{/snippet}

<svelte:window {onkeydown} {onpopstate} />

{#if open}
  <dialog
    bind:this={dialog}
    data-gallery-lightbox
    class="lightbox fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] gap-3 border-0 bg-black/90 p-4 open:grid"
    aria-label={ui[lang].imageViewer}
    oncancel={(event) => {
      event.preventDefault();
      requestClose();
    }}
    onwheel={preventPageScroll}
    ontouchmove={preventPageScroll}
  >
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]">
      <div class="flex min-w-0 items-center gap-2 md:justify-self-start">
        <button
          type="button"
          class="min-w-16 cursor-pointer border border-white/40 px-3 py-2 text-sm tabular-nums text-white hover:border-white"
          onclick={resetView}
          aria-label={ui[lang].resetZoom}
        >
          <span aria-hidden="true">
            {Math.round(scale * 100)}%
          </span>
        </button>
        <a
          href={originalSrc}
          target="_blank"
          rel="noopener"
          class="border border-white/40 px-3 py-2 text-sm text-white hover:border-white"
        >
          <span lang="cs">{ui.cs.openOriginal}</span>
          <span lang="en">{ui.en.openOriginal}</span>
        </a>
        <span
          role="status"
          aria-atomic="true"
          class="self-center text-sm tabular-nums text-white"
        >
          {index + 1} / {images.length}
        </span>
      </div>
      {#if comparisonIndexes.length > 1}
        <nav
          bind:this={comparisonNav}
          aria-label={ui[lang].compareDrawings}
          class="lightbox-comparison-options no-scrollbar col-span-2 row-start-2 w-full min-w-0 touch-pan-x scroll-px-4 overflow-x-auto px-4 md:col-span-1 md:col-start-2 md:row-start-1 md:max-w-[50vw] md:justify-self-center md:px-0"
        >
          <div class="mx-auto flex w-max gap-2">
            {#each comparisonIndexes as comparisonIndex}
              <button
                type="button"
                class="shrink-0 cursor-pointer border border-white/40 px-3 py-2 text-sm text-white hover:border-white disabled:cursor-default disabled:border-white disabled:bg-white disabled:text-black"
                aria-current={comparisonIndex === index ? 'true' : undefined}
                disabled={comparisonIndex === index}
                onclick={() => void compareTo(comparisonIndex)}
              >
                {comparisonLabel(comparisonIndex)}
              </button>
            {/each}
          </div>
        </nav>
      {:else}
        <div class="hidden md:block md:justify-self-center"></div>
      {/if}
      <button
        bind:this={closeButton}
        type="button"
        class="col-start-2 row-start-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border border-white/40 text-3xl leading-none text-white hover:border-white md:col-start-3 md:justify-self-end"
        onclick={requestClose}
        aria-label={ui[lang].close}>×</button
      >
    </div>
    <figure class="lightbox-layout min-h-0 w-full">
      <div
        bind:this={stage}
        bind:clientWidth={stageWidth}
        bind:clientHeight={stageHeight}
        role="presentation"
        class="lightbox-stage relative flex min-h-0 w-full touch-none items-center justify-center overflow-hidden"
        style:cursor={dragging ? 'grabbing' : 'grab'}
        {onwheel}
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
              class="h-auto max-h-full w-auto max-w-full object-contain select-none"
            />
          </div>
        {/if}
        <div
          class="lightbox-slide-current absolute inset-0 flex items-center justify-center overflow-hidden"
          class:lightbox-comparison-current={Boolean(comparisonPrevious)}
          style:transform={slideTransform(0)}
          style:transition={slideTransition}
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
              class="absolute h-auto max-h-full w-auto max-w-full object-contain select-none"
              style:transform={`translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`}
              onload={() => (pan = constrainedPan(pan))}
            />
            <div
              bind:this={deepZoomElement}
              class="absolute inset-0"
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
              class="h-auto max-h-full w-auto max-w-full object-contain select-none"
              style:transform={`translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`}
              onload={() => (pan = constrainedPan(pan))}
            />
          {/if}
        </div>
        {#if comparisonPrevious}
          <div
            class="lightbox-comparison-previous pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
            aria-hidden="true"
          >
            <img
              src={comparisonPrevious.src}
              width={comparisonPrevious.sourceWidth}
              height={comparisonPrevious.sourceHeight}
              alt=""
              draggable="false"
              style:width={comparisonPrevious.width
                ? `${comparisonPrevious.width}px`
                : undefined}
              style:height={comparisonPrevious.height
                ? `${comparisonPrevious.height}px`
                : undefined}
              style:transform={`translate3d(${comparisonPrevious.pan.x}px, ${comparisonPrevious.pan.y}px, 0) scale(${comparisonPrevious.scale})`}
              class="h-auto max-h-full w-auto max-w-full object-contain select-none"
            />
          </div>
        {/if}
        {#if images.length > 1}
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
              class="h-auto max-h-full w-auto max-w-full object-contain select-none"
            />
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="media-navigation-button lightbox-previous self-center"
        onclick={prev}
        aria-label={ui[lang].previousImage}>‹</button
      >
      <button
        type="button"
        class="media-navigation-button lightbox-next self-center"
        onclick={next}
        aria-label={ui[lang].nextImage}>›</button
      >
      <figcaption
        class="lightbox-caption relative w-full overflow-hidden text-white"
      >
        {#if images.length > 1}
          <div
            class="lightbox-caption-previous pointer-events-none absolute inset-0 overflow-y-auto"
            style:transform={slideTransform(-1)}
            style:transition={slideTransition}
            aria-hidden="true"
          >
            {@render captionContent(images[previousIndex])}
          </div>
        {/if}
        <div
          class="lightbox-caption-current absolute inset-0 overflow-y-auto overscroll-contain"
          style:transform={slideTransform(0)}
          style:transition={slideTransition}
        >
          {@render captionContent(images[index])}
        </div>
        {#if images.length > 1}
          <div
            class="lightbox-caption-next pointer-events-none absolute inset-0 overflow-y-auto"
            style:transform={slideTransform(1)}
            style:transition={slideTransition}
            aria-hidden="true"
          >
            {@render captionContent(images[nextIndex])}
          </div>
        {/if}
      </figcaption>
    </figure>
  </dialog>
{/if}

<style>
  .lightbox {
    --color-black: #000;
    --color-white: #fff;
  }

  .lightbox-layout {
    display: grid;
    grid-template-areas:
      'stage stage'
      'caption caption'
      'previous next';
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 6rem 3rem;
    gap: 0.75rem;
  }

  .lightbox-stage {
    grid-area: stage;
  }

  .lightbox-caption {
    grid-area: caption;
  }

  .lightbox-previous {
    grid-area: previous;
    justify-self: start;
  }

  .lightbox-next {
    grid-area: next;
    justify-self: end;
  }

  .lightbox-comparison-current {
    z-index: 10;
    animation: comparison-in 180ms ease-out;
  }

  @keyframes comparison-in {
    from {
      opacity: 0;
    }
  }

  @media (min-width: 640px) {
    .lightbox-layout {
      grid-template-areas:
        'previous stage next'
        '. caption .';
      grid-template-columns: 3rem minmax(0, 1fr) 3rem;
      grid-template-rows: minmax(0, 1fr) 6rem;
      column-gap: 1rem;
    }
  }
</style>

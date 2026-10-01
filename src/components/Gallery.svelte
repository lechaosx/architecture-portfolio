<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { on } from 'svelte/events';
  import { Tween, prefersReducedMotion } from 'svelte/motion';
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
    STRIP_EASING,
    clampPan,
    clampScale,
    comparisonSetIndexes,
    containedImageSize,
    displayedSwipeOffset,
    imageText,
    lightboxAreas,
    lightboxImageUrl,
    morphFrame,
    moveOn,
    stop,
    nativeZoomScale,
    panForZoom,
    settleDuration,
    sharedMaximumScale,
    slidePosition,
    textColumnLimit,
    zoomFloor,
    type GalleryImage,
    type Point,
    type Rect,
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
  import LightboxCard, { hasBack, type CardImage } from './LightboxCard.svelte';
  import LightboxControls from './LightboxControls.svelte';
  import LightboxTiles from './LightboxTiles.svelte';
  // Interactive island: a keyboard-navigable image lightbox.
  // This is the ONLY island that ships JS to the browser.
  let { images, responsiveImages }: {
    images: GalleryImage[];
    responsiveImages: (ResponsiveImage | undefined)[];
  } = $props();

  const slideDuration = 180;
  const openDuration = 400;
  const rest: View = { scale: 1, pan: { x: 0, y: 0 } };
  const noVariants = {};
  const zoomKeys = new Map<string, 'in' | 'out' | 'reset'>([
    ['+', 'in'],
    ['=', 'in'],
    ['-', 'out'],
    ['0', 'reset'],
  ]);

  /** A thumbnail's frame on screen, and the hover scale of its image. */
  interface Frame extends Rect {
    hover: number;
  }

  /** One image in the strip, `position` stage widths along it. */
  interface Slide {
    id: number;
    position: number;
    image: number;
    /**
     * What a card the lightbox changed away from last showed, which it goes
     * on showing; a slide that is neither current nor left is a neighbour.
     */
    left?: { textUp: boolean; view: View; towards: 1 | -1 };
    /** Reported by its card: its turn on screen, its drawing, and whether that has loaded. */
    turn?: number;
    drawing?: HTMLImageElement;
    ready?: boolean;
  }

  // The lightbox is open, from the moment it is asked to open until it is
  // asked to close; its dialog stays in the page while it fades out after.
  let open = $state(false);
  let mounted = $state(false);
  // How far open the lightbox shows: its backdrop and controls, 1 at rest;
  // and the card, between its thumbnail (0) and rest, and how far it has
  // faded in.
  const shownOpen = new Tween(0, { easing: STRIP_EASING });
  const cardAt = new Tween(1, { easing: STRIP_EASING });
  const cardShown = new Tween(1, { easing: STRIP_EASING });
  // Where the card moves from or to: a thumbnail's frame as it was when the
  // move began (`from`, at `cardAt` = `at`), and, closing, the frame it lands
  // on as it is now; `thumbnail` is the thumbnail it travels from or to.
  let morph = $state<{ from: Frame; at: number; landing?: Frame; thumbnail?: HTMLElement }>();
  let lang = $state<Lang>('en');
  // The current image, which the controls, the status and the address
  // describe.
  let index = $state(0);
  // The current image's view.
  let view = $state.raw<View>(rest);
  // How long the shown view takes to follow a change of it: a card the
  // lightbox comes back to eases from the view it was left at.
  let viewDuration = $state(0);
  // The current image's text side is up.
  let showDescription = $state(false);
  // The way the latest change goes, 1 the next way; the flip turns 1.
  let towards = $state<1 | -1>(1);
  // A drawing without responsive variants reveals its size once it loads.
  let loadedSize = $state<{ src: string; width: number; height: number }>();
  let slides = $state<Slide[]>([]);
  // The current image's slide, where the strip comes to rest.
  let at = $state(0);
  // Where the strip is on screen, in slides along it.
  const strip = new Tween(0, { easing: STRIP_EASING });
  // A live drag at rest: the strip's offset on screen when it began, and
  // whether the strip was moving then, when the drag carries it either way.
  let dragging = $state<{ from: number; strip: boolean }>();
  let cardDrag = $state<{ offset: number; turns: boolean }>();
  // Set only by the interpreter's `grab` intents, for the cursor.
  let grabbing = $state(false);
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let pixelRatio = $derived(devicePixelRatio.current ?? 1);
  let stage = $state<HTMLDivElement>()!;
  let dialog: HTMLDialogElement;
  let closeButton = $state<HTMLButtonElement>();
  let trigger: HTMLButtonElement | undefined;
  let thumbnailButtons: HTMLButtonElement[] = [];
  let nextSlideId = 0;
  const gestures = new LightboxGestures();
  const imageHistory = new LightboxHistory(untrack(() => images.length), {
    isOpen: () => open,
    show: showFromHistory,
    close: closeFromHistory,
  });
  let areas = $derived(
    lightboxAreas({ width: stageWidth, height: stageHeight }),
  );
  let lightboxImageSize = $derived(restImageSize(index));
  let originalSrc = $derived(
    responsiveImages[index]?.originalUrl ?? images[index]?.image,
  );
  let previousIndex = $derived(neighbourOf(index, -1));
  let nextIndex = $derived(neighbourOf(index, 1));
  let comparisonIndexes = $derived(comparisonSetIndexes(images, index));
  // What an image shows on its card does not depend on the view; only its
  // source does, as zooming asks for more detail.
  let current = $derived(cardImage(index));
  let flipped = $derived(showDescription && hasBack(current));
  let live = $derived(slides.find((slide) => slide.position === at));
  let variants = $derived({
    previous: isVariant(previousIndex) ? previousIndex : undefined,
    next: isVariant(nextIndex) ? nextIndex : undefined,
  });
  let phone = $derived(stageWidth <= PHONE_WIDTH);
  // On a phone the edge arrows make way for the text as it shows on screen:
  // each card's turn, as much as the card is on screen.
  let arrowsAside = $derived(
    phone
      ? slides.reduce(
          (aside, slide) =>
            aside + (slide.turn ?? 0) * Math.max(0, 1 - Math.abs(slide.position - strip.current)),
          0,
        )
      : 0,
  );
  // The card is carried by the strip or by the lightbox opening.
  let carried = $derived(strip.current !== strip.target || cardAt.current !== 1);
  // Closing, the frame the card is in goes on from the one it left towards
  // the one it lands on, so neither a change of thumbnail nor the page
  // scrolling under it makes it jump.
  let frame = $derived(
    morph &&
      (morph.landing && morph.at > 0
        ? betweenFrames(morph.landing, morph.from, Math.min(1, cardAt.current / morph.at))
        : morph.from),
  );
  let opened = $derived(
    frame && cardAt.current < 1 && lightboxImageSize
      ? morphFrame(
          frame,
          lightboxImageSize,
          { width: stageWidth, height: stageHeight },
          cardAt.current,
          frame.hover,
        )
      : undefined,
  );
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
  $effect(() => {
    if (prefersReducedMotion.current) untrack(() => strip.set(at, { duration: 0 }));
  });
  // At rest the strip holds only the current image and its neighbours.
  $effect(() => {
    if (strip.current !== strip.target || dragging) return;
    untrack(() => {
      if (live) slides = withNeighbours([live], at, live.image);
    });
  });
  // Shown closed, the lightbox leaves the page.
  $effect(() => {
    const settled =
      shownOpen.current === 0 &&
      cardAt.current === cardAt.target &&
      cardShown.current === cardShown.target;
    if (settled && !open) untrack(leave);
  });
  // Opening, the card moves to rest once its drawing has loaded.
  $effect(() => {
    if (open && live?.ready && cardAt.target !== 1) untrack(() => moveCard(cardAt, 1));
  });
  // The thumbnail is the card while the card travels from or to it; it stays
  // focusable, as closing gives it focus at once.
  $effect(() => {
    const thumbnail = morph?.thumbnail;
    if (!thumbnail || cardAt.current === cardAt.target) return;
    thumbnail.style.opacity = '0';
    return () => {
      thumbnail.style.opacity = '';
    };
  });
  // Closing into a thumbnail, the card lands where the thumbnail is as the
  // page scrolls or resizes, or fades where it is once the thumbnail is out
  // of view.
  let landingOn = $derived(!open && morph?.landing ? morph.thumbnail : undefined);
  $effect(() => {
    const thumbnail = landingOn;
    if (!thumbnail) return;
    const follow = () => untrack(() => closeInto(thumbnail));
    const stops = ['scroll', 'resize'].map((type) =>
      on(window, type, follow, { passive: true }),
    );
    return () => {
      for (const stop of stops) stop();
    };
  });
  // A resize, a rotation or another image keeps the current view within its
  // new limits.
  $effect(() => {
    const range = zoomRange;
    const restImage = lightboxImageSize;
    const bounds = areas;
    untrack(() => {
      const scale = clampScale(view.scale, range);
      const pan = restImage ? clampPan(view.pan, scale, restImage, bounds) : view.pan;
      if (scale !== view.scale || pan.x !== view.pan.x || pan.y !== view.pan.y) {
        setView({ scale, pan });
      }
    });
  });
  onMount(() => {
    const removeTriggers = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-lightbox-index]'),
    ).flatMap((button) => {
      const imageIndex = Number(button.dataset.lightboxIndex);
      if (!Number.isInteger(imageIndex) || !images[imageIndex]) return [];
      thumbnailButtons[imageIndex] = button;
      return [on(button, 'click', () => void show(imageIndex, button))];
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

    imageHistory.restore();
    return () => {
      imageHistory.destroy();
      for (const remove of removeTriggers) remove();
      languageObserver.disconnect();
    };
  });

  function setView(next: View, duration = 0) {
    view = next;
    viewDuration = duration;
  }

  /** Lets go of a drag: the strip and the card go on from where it left them. */
  function dropDrag() {
    dragging = undefined;
    cardDrag = undefined;
  }

  /** Ends the live gesture too, since a change made another way takes over from it. */
  function endDrag() {
    apply(gestures.end());
    dropDrag();
  }

  function previewUrl(imageIndex: number) {
    return imageUrl(imageIndex, 1);
  }

  function imageUrl(imageIndex: number, imageScale: number) {
    const responsiveImage = responsiveImages[imageIndex];
    return responsiveImage
      ? lightboxImageUrl(responsiveImage, areas.rest, imageScale, pixelRatio)
      : images[imageIndex]?.image;
  }

  /** A tiled drawing shows its preview beneath the tiles. */
  function drawingUrl(imageIndex: number, at: View) {
    return responsiveImages[imageIndex]?.deepZoom
      ? previewUrl(imageIndex)
      : imageUrl(imageIndex, at.scale);
  }

  function restImageSize(imageIndex: number) {
    const source =
      responsiveImages[imageIndex]?.source ??
      (loadedSize?.src === images[imageIndex]?.image ? loadedSize : undefined);
    return source && stageWidth > 0 && stageHeight > 0
      ? containedImageSize(source, areas.rest)
      : undefined;
  }

  function cardImage(imageIndex: number): CardImage {
    return {
      index: imageIndex,
      tiles: responsiveImages[imageIndex]?.deepZoom?.url,
      width: responsiveImages[imageIndex]?.source.width,
      height: responsiveImages[imageIndex]?.source.height,
      size: restImageSize(imageIndex),
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

  function neighbourOf(imageIndex: number, direction: 1 | -1) {
    return images.length
      ? (imageIndex + direction + images.length) % images.length
      : 0;
  }

  /**
   * Opens on image `i` at once; the card moves from its thumbnail `source`
   * once its drawing has loaded.
   */
  function show(i: number, source: HTMLButtonElement) {
    trigger = source;
    source.blur();
    imageHistory.open(i);
    enter(i, source);
    void showDialog();
  }

  function showFromHistory(i: number) {
    enter(i);
    void showDialog();
  }

  /**
   * Makes image `i` the open lightbox's current image, as it is at rest, and
   * brings the lightbox in: from `source` the card moves from it, where it
   * can, and otherwise fades in; opened from history it shows at once.
   * Opened again while it closes, it goes on from where it is: on the same
   * image it keeps its strip, and on another it changes to it.
   */
  function enter(i: number, source?: HTMLElement) {
    endDrag();
    const again = mounted;
    open = true;
    towards = 1;
    showDescription = false;
    if (again && live?.image === i) {
      setView(rest, prefersReducedMotion.current ? 0 : slideDuration);
      moveStrip();
    } else {
      setView(rest);
      stageWidth = innerWidth.current ?? 0;
      stageHeight = innerHeight.current ?? 0;
      at = 0;
      strip.set(0, { duration: 0 });
      slides = withNeighbours([newSlide(0, i)], 0, i);
    }
    index = i;
    if (again) {
      // The card goes back to rest from where it is once its drawing has
      // loaded, still leaving the thumbnail it was going into.
      morph = frame && { from: frame, at: cardAt.current, thumbnail: morph?.thumbnail };
      stop(cardAt);
    } else {
      const from = source && !prefersReducedMotion.current ? thumbnailFrame(source) : undefined;
      morph = from && { from, at: 0, thumbnail: source };
      cardAt.set(from ? 0 : 1, { duration: 0 });
      cardShown.set(from ? 1 : 0, { duration: 0 });
    }
    const duration = again || source ? undefined : 0;
    moveCard(cardShown, 1, duration);
    moveCard(shownOpen, 1, duration);
  }

  /** Makes the dialog modal at once, then focuses its close control. */
  async function showDialog() {
    mounted = true;
    if (!dialog.open) dialog.showModal();
    await tick();
    stageWidth = stage.clientWidth;
    stageHeight = stage.clientHeight;
    closeButton?.focus();
  }

  /** Moves one of the opening's numbers on from where it is to `to`. */
  function moveCard(number: Tween<number>, to: number, duration?: number) {
    moveOn(number, to, {
      duration:
        duration ??
        (prefersReducedMotion.current
          ? 0
          : (from, next) => settleDuration(openDuration, from, next)),
    });
  }

  /**
   * A thumbnail's frame and its image's hover scale, for the card to move
   * from or to: only while the thumbnail is fully in view and clear of the
   * sticky header, as the card would otherwise pass over or under the header.
   */
  function thumbnailFrame(thumbnail: HTMLElement): Frame | undefined {
    const { x, y, width, height } = thumbnail.getBoundingClientRect();
    const image = thumbnail.querySelector('img');
    const header = document.querySelector('body > header')?.getBoundingClientRect();
    const underHeader =
      header &&
      x < header.right &&
      x + width > header.left &&
      y < header.bottom &&
      y + height > header.top;
    // Within a pixel, as a thumbnail scrolled flush with an edge may lie a
    // fraction past it.
    const inView =
      width > 0 &&
      height > 0 &&
      x > -1 &&
      y > -1 &&
      x + width < innerWidth.current! + 1 &&
      y + height < innerHeight.current! + 1;
    if (!inView || underHeader) return undefined;
    return {
      x,
      y,
      width,
      height,
      hover: image ? image.getBoundingClientRect().width / thumbnail.clientWidth : 1,
    };
  }

  function betweenFrames(from: Frame, to: Frame, share: number): Frame {
    const at = (key: keyof Frame) => from[key] + (to[key] - from[key]) * share;
    return { x: at('x'), y: at('y'), width: at('width'), height: at('height'), hover: at('hover') };
  }

  function requestClose() {
    if (open) imageHistory.close();
  }

  /**
   * Closes at once: the page behind takes input and focus from now, while
   * the lightbox, no longer modal, fades out and its card goes into the
   * current image's thumbnail, or fades where it is.
   */
  function closeFromHistory() {
    if (!open) return;
    endDrag();
    open = false;
    if (mounted) dialog.close();
    trigger?.focus({ preventScroll: true });
    moveCard(shownOpen, 0);
    const thumbnail = thumbnailButtons[index];
    if (
      thumbnail &&
      view.scale === 1 &&
      !flipped &&
      cardShown.current === 1 &&
      !prefersReducedMotion.current
    ) {
      closeInto(thumbnail);
    } else {
      fadeCard();
    }
  }

  /**
   * The card goes into `thumbnail` as it is on screen, from where it is; a
   * thumbnail out of view fades it where it is instead. The frame it goes
   * from is the one it is in now, so the move goes on without a jump.
   */
  function closeInto(thumbnail: HTMLElement) {
    const landing = thumbnailFrame(thumbnail);
    if (!landing) {
      fadeCard();
      return;
    }
    const moving = morph?.landing && morph.thumbnail === thumbnail;
    morph = moving
      ? { ...morph!, landing }
      : { from: frame ?? landing, at: cardAt.current, landing, thumbnail };
    if (!moving) moveCard(cardAt, 0);
  }

  /** The card fades where it is. */
  function fadeCard() {
    if (morph) morph = { from: frame!, at: cardAt.current };
    stop(cardAt);
    moveCard(cardShown, 0);
  }

  function leave() {
    mounted = false;
    morph = undefined;
    trigger = undefined;
  }

  function isVariant(target: number) {
    return target !== index && comparisonIndexes.includes(target);
  }

  /**
   * Changes to image `target` at once: a variant of this card blends in, and
   * another card slides in travelling `direction`, 1 the next way.
   */
  function changeTo(target: number, direction: 1 | -1) {
    if (images.length < 2 || target === index) {
      endDrag();
      moveStrip();
      return;
    }
    const variant = isVariant(target);
    if (variant) endDrag();
    else slideTo(target, direction);
    towards = direction;
    index = target;
    showDescription = false;
    if (variant) {
      live!.image = target;
      moveStrip();
    } else {
      setView(rest, prefersReducedMotion.current ? 0 : slideDuration);
    }
    imageHistory.change(target);
  }

  /**
   * Moves the strip on from where it is to `target`'s slide. The card it
   * leaves keeps what it showed while it is on screen; one it comes back to
   * turns and zooms from there to how the current image is shown.
   */
  function slideTo(target: number, direction: 1 | -1) {
    const onScreen = strip.current;
    endDrag();
    const position = slidePosition(at, onScreen, direction, target, imageAt);
    if (live) live.left = { textUp: flipped, view, towards };
    const arriving =
      slides.find((slide) => slide.position === position && slide.image === target) ??
      newSlide(position, target);
    arriving.left = undefined;
    const shown = slides.filter(
      (slide) =>
        slide !== arriving &&
        slide.position !== position &&
        Math.abs(slide.position - onScreen) < 1,
    );
    slides = withNeighbours([...shown, arriving], position, target);
    at = position;
    moveStrip();
  }

  /** Eases the strip on from where it is to rest at the current image's slide. */
  function moveStrip() {
    moveOn(strip, at, {
      duration: prefersReducedMotion.current
        ? 0
        : (from, to) => settleDuration(slideDuration, from, to),
    });
  }

  function newSlide(position: number, image: number): Slide {
    return { id: nextSlideId++, position, image };
  }

  /**
   * `kept` with the neighbours of `image`'s slide at `position` wherever none
   * is kept, in the order the slides were made, so no slide is moved in the
   * page, which would lose a card's reading position.
   */
  function withNeighbours(kept: Slide[], position: number, image: number) {
    if (images.length < 2) return kept;
    const neighbours = ([-1, 1] as const).flatMap((side) => {
      const place = position + side;
      if (kept.some((slide) => slide.position === place)) return [];
      const neighbour = neighbourOf(image, side);
      return [
        slides.find(
          (slide) =>
            slide.position === place && slide.image === neighbour && !slide.left,
        ) ?? newSlide(place, neighbour),
      ];
    });
    return [...kept, ...neighbours].sort((first, second) => first.id - second.id);
  }

  function imageAt(position: number) {
    return slides.find((slide) => slide.position === position)?.image;
  }

  function toggleDescription() {
    endDrag();
    moveStrip();
    towards = 1;
    showDescription = !flipped;
  }

  function next() {
    changeTo(nextIndex, 1);
  }
  function prev() {
    changeTo(previousIndex, -1);
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

  /**
   * A drag at rest scrubs the card's blend towards a variant, or moves the
   * strip towards another card; one that begins while the strip moves takes
   * the strip from where it is, whichever way it goes.
   */
  function dragAtRest(offset: number) {
    dragging ??= (() => {
      const from = (at - strip.current) * stageWidth;
      return { from, strip: Math.abs(from) >= 0.5 };
    })();
    const shift = (pixels: number) =>
      strip.set(
        at - displayedSwipeOffset(pixels, prefersReducedMotion.current) / stageWidth,
        { duration: 0 },
      );
    if (dragging.strip) {
      shift(dragging.from + offset);
      return;
    }
    const variant =
      offset < 0 ? variants.next : offset > 0 ? variants.previous : undefined;
    shift(variant === undefined ? offset : 0);
    cardDrag = { offset, turns: false };
  }

  /** A drag ends without a change: the strip and the card return to rest. */
  function settle() {
    dropDrag();
    moveStrip();
  }

  function constrainedPan(nextPan: Point, nextScale = view.scale) {
    const imageSize = renderedImageSize();
    return imageSize ? clampPan(nextPan, nextScale, imageSize, areas) : nextPan;
  }

  function renderedImageSize() {
    if (lightboxImageSize) return lightboxImageSize;
    const drawing = live?.drawing;
    if (drawing) return { width: drawing.clientWidth, height: drawing.clientHeight };
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

  /** A comparison set shares one zoom limit, so each variant can take the card's view. */
  function maximumScale() {
    const set = comparisonSetIndexes(images, index);
    return sharedMaximumScale((set.length ? set : [index]).map(maximumScaleFor));
  }

  /** Scales to `scale` while keeping the image point under `point` in place. */
  function zoomTo(scale: number, point: Point) {
    setView({
      scale,
      pan: constrainedPan(panForZoom(view.pan, view.scale, scale, point), scale),
    });
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

  function gestureContext(): GestureContext {
    return { view, range: zoomRange, flipped };
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
        setView({ scale: intent.scale, pan: constrainedPan(intent.pan, intent.scale) });
      } else if (intent.type === 'zoom') {
        zoomTo(intent.scale, intent.point);
      } else if (intent.type === 'drag') {
        dragAtRest(intent.offset);
      } else if (intent.type === 'commit') {
        changeTo(intent.direction > 0 ? nextIndex : previousIndex, intent.direction);
      } else if (intent.type === 'settle') {
        settle();
      } else if (intent.type === 'turn') {
        cardDrag = { offset: intent.offset, turns: true };
      } else if (intent.type === 'turnBack') {
        dropDrag();
        showDescription = false;
      } else {
        dropDrag();
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
    apply(gestures.mouseDown(stagePoint(e), gestureContext()), e);
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

  function onImageLoad(drawing: HTMLImageElement) {
    if (!responsiveImages[index]) {
      loadedSize = {
        src: images[index].image,
        width: drawing.naturalWidth,
        height: drawing.naturalHeight,
      };
    }
    const pan = constrainedPan(view.pan);
    if (pan.x !== view.pan.x || pan.y !== view.pan.y) {
      setView({ scale: view.scale, pan });
    }
  }

  function selectingText() {
    const selection = getSelection();
    return Boolean(
      selection &&
        !selection.isCollapsed &&
        stage.contains(selection.anchorNode),
    );
  }

  // Svelte attaches touch handlers as passive, which ignores their
  // preventDefault.
  function cancellable(handler: (event: TouchEvent) => void) {
    return (element: HTMLElement) =>
      on(element, 'touchmove', handler, { passive: false });
  }
</script>

<svelte:window {onkeydown} onpopstate={() => imageHistory.popstate()} />

<!-- Always in the page, so it becomes modal in the click itself; no longer
     modal while it fades out after closing, so the page behind takes input,
     but still drawn over it. -->
<dialog
  bind:this={dialog}
  data-gallery-lightbox
  class={[
    'lightbox fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden border-0 p-0 text-white',
    { 'lightbox-leaving': mounted && !open },
  ]}
  style:--lightbox-gap={`${areas.gap}px`}
  style:--lightbox-band={`${areas.band}px`}
  style:--lightbox-control={`${CONTROL_SIZE}px`}
  style:--lightbox-open={shownOpen.current}
  aria-label={ui[lang].imageViewer}
  inert={!open}
  oncancel={(event) => {
    event.preventDefault();
    requestClose();
  }}
  onwheel={preventPageScroll}
  {@attach cancellable(preventPageScroll)}
>
  {#if mounted}
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
      {@attach cancellable(ontouchmove)}
      {ontouchend}
      ontouchcancel={(e) => apply(gestures.touchCancel(), e)}
    >
      <!-- Opening, the card moves from its thumbnail's frame, cropped to it,
           or, where it cannot, fades in. -->
      <div
        class="absolute inset-0"
        style:transform={opened &&
          `translate(${opened.x}px, ${opened.y}px) scale(${opened.scale})`}
        style:clip-path={opened &&
          `inset(${opened.clip.top}px ${opened.clip.right}px ${opened.clip.bottom}px ${opened.clip.left}px)`}
        style:opacity={cardShown.current < 1 ? cardShown.current : undefined}
      >
        <!-- One translation moves every slide, so they stay edge to edge. -->
        <div
          class="lightbox-strip absolute inset-0"
          style:transform={`translate3d(${-strip.current * 100}%, 0, 0)`}
        >
          {#each slides as slide (slide.id)}
            {@const isCurrent = slide.position === at}
            <div
              class={[
                'lightbox-slide absolute inset-0 overflow-hidden',
                {
                  'lightbox-slide-current': isCurrent,
                  'lightbox-slide-previous': !isCurrent && slide.position === at - 1,
                  'lightbox-slide-next': !isCurrent && slide.position === at + 1,
                },
              ]}
              style:transform={`translate3d(${slide.position * 100}%, 0, 0)`}
              inert={!isCurrent}
            >
              {#if isCurrent || slide.left}
                {@const left = isCurrent ? undefined : slide.left}
                <LightboxCard
                  image={slide.image}
                  describe={cardImage}
                  source={drawingUrl}
                  towards={left?.towards ?? towards}
                  textUp={left ? left.textUp : flipped}
                  variants={isCurrent ? variants : noVariants}
                  drag={isCurrent ? cardDrag : undefined}
                  view={left?.view ?? view}
                  viewDuration={isCurrent ? viewDuration : 0}
                  moving={carried}
                  restArea={areas.rest}
                  {columnLimit}
                  {lang}
                  {tiledCanvas}
                  bind:drawing={slide.drawing}
                  bind:turn={slide.turn}
                  bind:ready={slide.ready}
                  onload={isCurrent ? onImageLoad : undefined}
                />
              {:else}
                {@const size = restImageSize(slide.image)}
                <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <img
                    src={previewUrl(slide.image)}
                    width={responsiveImages[slide.image]?.source.width}
                    height={responsiveImages[slide.image]?.source.height}
                    alt=""
                    draggable="false"
                    decoding="async"
                    style:width={size ? `${size.width}px` : undefined}
                    style:height={size ? `${size.height}px` : undefined}
                    class="size-auto max-h-full max-w-full object-contain select-none"
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="lightbox-controls absolute inset-0" style:opacity={shownOpen.current}>
      <LightboxControls
        {lang}
        {setOptions}
        currentIndex={index}
        count={images.length}
        {originalSrc}
        hasBack={hasBack(current)}
        {flipped}
        {arrowsAside}
        bind:closeButton
        onselect={(setIndex) => changeTo(setIndex, setIndex > index ? 1 : -1)}
        onprevious={prev}
        onnext={next}
        onclose={requestClose}
        ontoggle={toggleDescription}
      />
    </div>
    <p role="status" aria-atomic="true" class="sr-only">
      {index + 1} / {images.length}
    </p>
  {/if}
</dialog>

{#snippet tiledCanvas(url: string, restImage: Size | undefined, cardView: View, resting: boolean)}
  <LightboxTiles
    {url}
    {resting}
    view={cardView}
    {restImage}
    stage={{ width: stageWidth, height: stageHeight }}
  />
{/snippet}

<style>
  /* The backdrop is the dialog's own, so it fades with the opening. */
  .lightbox {
    --color-black: #000;
    --color-white: #fff;
    background: rgb(0 0 0 / calc(91% * var(--lightbox-open)));
  }

  .lightbox::backdrop {
    background: transparent;
  }

  .lightbox-leaving {
    display: block;
    z-index: 50;
    pointer-events: none;
  }

  /* The controls lie over the stage without taking its input. */
  .lightbox-controls {
    pointer-events: none;
  }
</style>

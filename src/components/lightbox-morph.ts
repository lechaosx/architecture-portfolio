/**
 * Opening and closing are one same-document View Transition between a
 * thumbnail's stable frame and the lightbox image. The image morphs only when
 * the thumbnail is fully in view and clear of the sticky header; otherwise
 * the document snapshot's fade carries the change alone. Page scrolling is
 * captured for the transition's length, so neither endpoint moves.
 */

/** `show` opens the lightbox and returns its image once it is in the DOM. */
export async function morphOpen(
  thumbnail: HTMLElement,
  show: () => Promise<HTMLImageElement>,
) {
  const morph = unobscured(thumbnail);
  const thumbnailImage = morph ? thumbnail.querySelector('img') : null;
  // The hover scale at the click is frozen and carried into the opening snapshot.
  const hoverScale = thumbnailImage
    ? thumbnailImage.getBoundingClientRect().width / thumbnail.clientWidth
    : 1;
  if (thumbnailImage) {
    thumbnailImage.style.transition = 'none';
    thumbnailImage.style.scale = String(hoverScale);
  }
  if (morph) {
    document.documentElement.style.setProperty(
      '--lightbox-source-scale',
      String(hoverScale),
    );
    thumbnail.style.viewTransitionName = 'lightbox-image';
  }
  let image: HTMLImageElement | undefined;
  const release = captureScrolling();
  try {
    await document.startViewTransition({
      update: async () => {
        image = await show();
        if (!morph) image.style.viewTransitionName = 'none';
        await image.decode();
        thumbnail.style.viewTransitionName = '';
      },
      types: ['lightbox-open'],
    }).finished;
  } finally {
    release();
    thumbnail.style.viewTransitionName = '';
    thumbnailImage?.style.removeProperty('transition');
    thumbnailImage?.style.removeProperty('scale');
    document.documentElement.style.removeProperty('--lightbox-source-scale');
    image?.style.removeProperty('view-transition-name');
  }
}

/** `matches`: the image still shows what the thumbnail does, so it can morph back. */
export async function morphClose(
  thumbnail: HTMLElement,
  image: HTMLImageElement,
  matches: boolean,
  hide: () => Promise<void>,
) {
  const morph = matches && unobscured(thumbnail);
  if (!morph) image.style.viewTransitionName = 'none';
  const release = captureScrolling();
  try {
    await document.startViewTransition({
      update: async () => {
        await hide();
        if (morph) thumbnail.style.viewTransitionName = 'lightbox-image';
      },
      types: ['lightbox-close'],
    }).finished;
  } finally {
    release();
    thumbnail.style.viewTransitionName = '';
    image.style.removeProperty('view-transition-name');
  }
}

function unobscured(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const header = document
    .querySelector<HTMLElement>('body > header')
    ?.getBoundingClientRect();
  const overlapsHeader =
    header &&
    bounds.left < header.right &&
    bounds.right > header.left &&
    bounds.top < header.bottom &&
    bounds.bottom > header.top;
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

function captureScrolling() {
  const prevent = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const options = { capture: true, passive: false } as const;
  window.addEventListener('wheel', prevent, options);
  window.addEventListener('touchmove', prevent, options);
  return () => {
    window.removeEventListener('wheel', prevent, options);
    window.removeEventListener('touchmove', prevent, options);
  };
}

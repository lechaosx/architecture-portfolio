const HISTORY_KEY = 'architecturePortfolioGallery';

export function galleryImageHash(index: number) {
  return `#image-${index + 1}`;
}

export function galleryImageIndex(hash: string, imageCount: number) {
  const match = /^#image-([1-9]\d*)$/.exec(hash);
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  return index < imageCount ? index : undefined;
}

export interface LightboxHistoryHandlers {
  isOpen(): boolean;
  /** Shows image `index`, opening the lightbox if it is closed. */
  show(index: number): void;
  close(): Promise<void>;
}

/**
 * The open lightbox is one marked history entry whose `#image-N` hash names
 * its image: opening pushes it, changing image replaces it, and Back and
 * Forward close and reopen the lightbox. While the entry is active, browser
 * scroll restoration is manual, so traversing hashes never moves the page
 * behind the overlay.
 */
export class LightboxHistory {
  #imageCount: number;
  #handlers: LightboxHistoryHandlers;
  #savedScrollRestoration: ScrollRestoration | undefined;

  constructor(imageCount: number, handlers: LightboxHistoryHandlers) {
    this.#imageCount = imageCount;
    this.#handlers = handlers;
  }

  /** A page loaded on an image hash opens it over a base entry, so Back first closes it. */
  restore() {
    const index = galleryImageIndex(location.hash, this.#imageCount);
    if (index === undefined) return;
    this.#suspendScrollRestoration();
    const initialState = history.state;
    history.replaceState(
      initialState,
      '',
      `${location.pathname}${location.search}`,
    );
    history.pushState(marked(initialState), '', galleryImageHash(index));
    this.#handlers.show(index);
  }

  open(index: number) {
    this.#suspendScrollRestoration();
    history.pushState(marked(history.state), '', galleryImageHash(index));
  }

  change(index: number) {
    history.replaceState(marked(history.state), '', galleryImageHash(index));
  }

  close() {
    this.#suspendScrollRestoration();
    if (isMarked(history.state)) {
      history.back();
      return;
    }
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}`,
    );
    void this.#handlers.close().finally(() => this.#resumeScrollRestoration());
  }

  popstate() {
    const index = galleryImageIndex(location.hash, this.#imageCount);
    if (!this.#handlers.isOpen() && index === undefined) return;
    this.#suspendScrollRestoration();
    if (index === undefined) {
      void this.#handlers
        .close()
        .finally(() => this.#resumeScrollRestoration());
    } else {
      this.#handlers.show(index);
    }
  }

  destroy() {
    this.#resumeScrollRestoration();
  }

  #suspendScrollRestoration() {
    if (this.#savedScrollRestoration !== undefined) return;
    this.#savedScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
  }

  #resumeScrollRestoration() {
    if (this.#savedScrollRestoration === undefined) return;
    history.scrollRestoration = this.#savedScrollRestoration;
    this.#savedScrollRestoration = undefined;
  }
}

function marked(state: unknown) {
  return {
    ...(state !== null && typeof state === 'object' ? state : {}),
    [HISTORY_KEY]: true,
  };
}

function isMarked(state: unknown) {
  return (
    state !== null &&
    typeof state === 'object' &&
    (state as Record<string, unknown>)[HISTORY_KEY] === true
  );
}

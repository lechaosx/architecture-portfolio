const HISTORY_KEY = 'architecturePortfolioGallery';
// Browsers ignore (Chromium) or refuse (Firefox) more than about 200 address
// changes in 10 s, which holding an arrow key reaches: a run of changes may
// write BURST addresses at once, then one every WRITE_INTERVAL ms, 150 in 10 s
// at most.
const BURST = 50;
const WRITE_INTERVAL = 100;

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
  close(): void;
}

/**
 * The open lightbox is one marked history entry whose `#image-N` hash names
 * its image: opening pushes it, changing image replaces it, and Back and
 * Forward close and reopen the lightbox. Each change writes its address at
 * once, until a long burst writes only the latest every `WRITE_INTERVAL` ms.
 * Opening again while the browser has still to go back over the entry closing
 * left waits for that traversal and pushes the entry after it, since
 * browsers disagree on a push made while one is pending. While the
 * entry is active, browser scroll restoration is manual, so traversing hashes
 * never moves the page behind the overlay.
 */
export class LightboxHistory {
  #imageCount: number;
  #handlers: LightboxHistoryHandlers;
  #savedScrollRestoration: ScrollRestoration | undefined;
  /** An image whose address waits for the write interval to pass. */
  #pending: number | undefined;
  #interval: ReturnType<typeof setTimeout> | undefined;
  /** From when a write no longer eats into the burst: each write puts it off `WRITE_INTERVAL`. */
  #free = 0;
  /** Closing has gone back over the entry, and the browser has still to get there. */
  #leaving = false;
  /** An image opened meanwhile, whose entry is pushed once it has. */
  #reopening: number | undefined;

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
    this.#pending = undefined;
    this.#suspendScrollRestoration();
    if (this.#leaving) this.#reopening = index;
    else history.pushState(marked(history.state), '', galleryImageHash(index));
  }

  change(index: number) {
    if (this.#reopening !== undefined) {
      this.#reopening = index;
      return;
    }
    this.#pending = index;
    if (this.#interval === undefined) this.#write();
  }

  /** Closes at once; the browser goes back over the lightbox's entry after. */
  close() {
    this.#write();
    this.#suspendScrollRestoration();
    const marked = isMarked(history.state);
    this.#reopening = undefined;
    this.#handlers.close();
    if (marked) {
      this.#leaving = true;
      history.back();
    } else {
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${location.search}`,
      );
      this.#resumeScrollRestoration();
    }
  }

  popstate() {
    this.#pending = undefined;
    if (this.#leaving) {
      this.#leaving = false;
      const index = this.#reopening;
      this.#reopening = undefined;
      if (index === undefined) this.#resumeScrollRestoration();
      else history.pushState(marked(history.state), '', galleryImageHash(index));
      return;
    }
    const index = galleryImageIndex(location.hash, this.#imageCount);
    if (!this.#handlers.isOpen() && index === undefined) return;
    this.#suspendScrollRestoration();
    if (index === undefined) {
      this.#handlers.close();
      this.#resumeScrollRestoration();
    } else {
      this.#handlers.show(index);
    }
  }

  destroy() {
    clearTimeout(this.#interval);
    this.#resumeScrollRestoration();
  }

  #write() {
    const index = this.#pending;
    if (index === undefined) return;
    const now = Date.now();
    const free = Math.max(now, this.#free);
    const wait = free - now - (BURST - 1) * WRITE_INTERVAL;
    if (wait <= 0) {
      this.#free = free + WRITE_INTERVAL;
      this.#pending = undefined;
      history.replaceState(marked(history.state), '', galleryImageHash(index));
      return;
    }
    this.#interval ??= setTimeout(() => {
      this.#interval = undefined;
      this.#write();
    }, wait);
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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  LightboxHistory,
  galleryImageHash,
  galleryImageIndex,
} from './lightbox-history';

/** A session history with one page, driven the way a browser drives it. */
class FakeBrowser {
  entries: { state: unknown; url: string }[];
  current = 0;
  scrollRestoration: ScrollRestoration = 'auto';
  replacements = 0;
  onpopstate = () => {};

  constructor(url: string) {
    this.entries = [{ state: null, url }];
  }

  get state() {
    return this.entries[this.current].state;
  }

  get url() {
    return this.entries[this.current].url;
  }

  pushState(state: unknown, _: string, url: string) {
    this.entries.splice(this.current + 1, Infinity, {
      state,
      url: this.resolve(url),
    });
    this.current += 1;
  }

  replaceState(state: unknown, _: string, url: string) {
    this.replacements += 1;
    this.entries[this.current] = { state, url: this.resolve(url) };
  }

  back() {
    this.go(-1);
  }

  go(delta: number) {
    this.current += delta;
    this.onpopstate();
  }

  resolve(url: string) {
    return url.startsWith('#') ? `${this.url.split('#')[0]}${url}` : url;
  }
}

let browser: FakeBrowser;
let shown: number[];
let closes: number;
let history: LightboxHistory;
let open: boolean;

/** Opens the lightbox on `index` as a click on its thumbnail does. */
function openImage(index: number) {
  history.open(index);
  open = true;
}

const settled = () => vi.advanceTimersByTime(0);
/** Longer than the least time between two address writes. */
const written = () => vi.advanceTimersByTime(150);

function load(url: string) {
  browser = new FakeBrowser(url);
  vi.stubGlobal('history', browser);
  vi.stubGlobal('location', {
    get pathname() {
      return browser.url.split(/[?#]/)[0];
    },
    get search() {
      const query = browser.url.split('#')[0].split('?')[1];
      return query ? `?${query}` : '';
    },
    get hash() {
      const hash = browser.url.split('#')[1];
      return hash ? `#${hash}` : '';
    },
  });
  shown = [];
  closes = 0;
  open = false;
  history = new LightboxHistory(12, {
    isOpen: () => open,
    show: (index) => {
      open = true;
      shown.push(index);
    },
    close: () => {
      open = false;
      closes += 1;
    },
  });
  browser.onpopstate = () => history.popstate();
}

beforeEach(() => {
  vi.useFakeTimers();
  load('/projects/a/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('image hashes', () => {
  test('are one-based', () => {
    expect(galleryImageHash(0)).toBe('#image-1');
    expect(galleryImageHash(11)).toBe('#image-12');
  });

  test('resolve to zero-based indexes', () => {
    expect(galleryImageIndex('#image-1', 12)).toBe(0);
    expect(galleryImageIndex('#image-12', 12)).toBe(11);
  });

  test.each(['', '#image-0', '#image-13', '#image-1-more', '#other-1'])(
    'ignore the invalid or out-of-range hash %s',
    (hash) => {
      expect(galleryImageIndex(hash, 12)).toBeUndefined();
    },
  );
});

describe('the lightbox history', () => {
  test('opening adds one entry, changing image replaces it, and Back closes', () => {
    openImage(2);
    expect(browser.entries.map((entry) => entry.url)).toEqual([
      '/projects/a/',
      '/projects/a/#image-3',
    ]);
    history.change(5);
    history.change(6);
    written();
    expect(browser.entries).toHaveLength(2);
    expect(browser.url).toBe('/projects/a/#image-7');

    browser.back();
    settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/');
  });

  test('an ordinary run of changes writes each address at once', () => {
    openImage(0);
    for (const index of [1, 2, 3, 4, 5]) {
      history.change(index);
      expect(browser.url).toBe(`/projects/a/#image-${index + 1}`);
    }
  });

  test('a long burst writes the latest address ten times a second', () => {
    // Browsers stop taking more than about 200 address changes in 10 s.
    load('/projects/a/');
    history = new LightboxHistory(200, {
      isOpen: () => open,
      show: () => {},
      close: () => {},
    });
    openImage(0);
    const before = browser.replacements;
    for (let index = 1; index < 120; index += 1) history.change(index);
    expect(browser.replacements - before).toBe(50);
    written();
    expect(browser.url).toBe('/projects/a/#image-120');
    expect(browser.replacements - before).toBe(51);
    history.destroy();
  });

  test('closing first writes an address still to be written, so Forward reopens the last image', () => {
    openImage(0);
    history.change(1);
    history.change(2);
    history.close();
    written();
    expect(browser.url).toBe('/projects/a/');
    browser.go(1);
    expect(shown).toEqual([2]);
  });

  test('a held key keeps writing ten addresses a second', () => {
    load('/projects/a/');
    history = new LightboxHistory(200, {
      isOpen: () => open,
      show: () => {},
      close: () => {},
    });
    openImage(0);
    for (let index = 1; index < 60; index += 1) history.change(index);
    const before = browser.replacements;
    // A change every 30 ms for 0.6 s.
    for (let index = 60; index < 80; index += 1) {
      vi.advanceTimersByTime(30);
      history.change(index);
    }
    expect(browser.replacements - before).toBe(6);
    history.destroy();
  });

  test('opening again before the browser has gone back waits for it, then pushes its entry', () => {
    openImage(0);
    // Browsers traverse history asynchronously, and disagree on a push made
    // while a traversal is pending.
    browser.onpopstate = () => setTimeout(() => history.popstate());
    const back = browser.back.bind(browser);
    browser.back = () => setTimeout(back);
    history.close();
    openImage(4);
    written();
    expect(browser.entries.map((entry) => entry.url)).toEqual([
      '/projects/a/',
      '/projects/a/#image-5',
    ]);
    expect(browser.current).toBe(1);
    expect(closes).toBe(1);
    expect(shown).toEqual([]);
  });

  test('Forward reopens the last image', () => {
    openImage(2);
    history.change(4);
    browser.back();
    browser.go(1);
    expect(shown).toEqual([4]);
  });

  test('closing goes back over its own entry', () => {
    openImage(0);
    history.close();
    expect(browser.current).toBe(0);
    expect(closes).toBe(1);
  });

  test('closing starts at once, before the browser has gone back', () => {
    openImage(0);
    // Browsers traverse history asynchronously.
    browser.onpopstate = () => setTimeout(() => history.popstate());
    history.close();
    expect(closes).toBe(1);
    settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/');
  });

  test('keeps the page state it shares an entry with', () => {
    browser.replaceState({ page: 1 }, '', '/projects/a/');
    openImage(0);
    expect(browser.state).toMatchObject({ page: 1 });
  });

  test('a directly linked image first closes to its page before Back leaves it', () => {
    load('/projects/a/?lang=cs#image-4');
    history.restore();
    expect(shown).toEqual([3]);
    expect(browser.entries.map((entry) => entry.url)).toEqual([
      '/projects/a/?lang=cs',
      '/projects/a/?lang=cs#image-4',
    ]);
    history.close();
    settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/?lang=cs');
  });

  test('ignores a page without an image hash', () => {
    history.restore();
    expect(shown).toEqual([]);
    expect(browser.entries).toHaveLength(1);
  });

  test('closes in place when its entry is not the lightbox one', () => {
    openImage(1);
    browser.replaceState(null, '', '/projects/a/#image-2');
    history.close();
    settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/');
    expect(browser.entries).toHaveLength(2);
  });

  test('suspends scroll restoration while its entry is active', () => {
    openImage(1);
    expect(browser.scrollRestoration).toBe('manual');
    history.close();
    settled();
    expect(browser.scrollRestoration).toBe('auto');
  });

  test('a traversal between other hashes leaves it alone', () => {
    browser.pushState(null, '', '#section');
    browser.back();
    expect(shown).toEqual([]);
    expect(closes).toBe(0);
    expect(browser.scrollRestoration).toBe('auto');
  });

  test('gives back scroll restoration when it goes away', () => {
    openImage(1);
    history.destroy();
    expect(browser.scrollRestoration).toBe('auto');
  });
});

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
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

const settled = () => new Promise((resolve) => setTimeout(resolve));

function load(url: string) {
  browser = new FakeBrowser(url);
  Object.assign(globalThis, {
    history: browser,
    location: {
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
    close: async () => {
      open = false;
      closes += 1;
    },
  });
  browser.onpopstate = () => history.popstate();
}

const globals = ['history', 'location'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
);

beforeEach(() => load('/projects/a/'));

afterAll(() => {
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
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
  test('opening adds one entry, changing image replaces it, and Back closes', async () => {
    openImage(2);
    expect(browser.entries.map((entry) => entry.url)).toEqual([
      '/projects/a/',
      '/projects/a/#image-3',
    ]);
    history.change(5);
    history.change(6);
    expect(browser.entries).toHaveLength(2);
    expect(browser.url).toBe('/projects/a/#image-7');

    browser.back();
    await settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/');
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

  test('keeps the page state it shares an entry with', () => {
    browser.replaceState({ page: 1 }, '', '/projects/a/');
    openImage(0);
    expect(browser.state).toMatchObject({ page: 1 });
  });

  test('a directly linked image first closes to its page before Back leaves it', async () => {
    load('/projects/a/?lang=cs#image-4');
    history.restore();
    expect(shown).toEqual([3]);
    expect(browser.entries.map((entry) => entry.url)).toEqual([
      '/projects/a/?lang=cs',
      '/projects/a/?lang=cs#image-4',
    ]);
    history.close();
    await settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/?lang=cs');
  });

  test('ignores a page without an image hash', () => {
    history.restore();
    expect(shown).toEqual([]);
    expect(browser.entries).toHaveLength(1);
  });

  test('closes in place when its entry is not the lightbox one', async () => {
    openImage(1);
    browser.replaceState(null, '', '/projects/a/#image-2');
    history.close();
    await settled();
    expect(closes).toBe(1);
    expect(browser.url).toBe('/projects/a/');
    expect(browser.entries).toHaveLength(2);
  });

  test('suspends scroll restoration while its entry is active', async () => {
    openImage(1);
    expect(browser.scrollRestoration).toBe('manual');
    history.close();
    await settled();
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

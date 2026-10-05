# Maintainers' guide

How to build, test and change the code. Background: [ARCHITECTURE.md](ARCHITECTURE.md)
(why the code is shaped this way), [FEATURES.md](FEATURES.md) (why it behaves
this way).

## Commands

Needs [Nix](https://nixos.org) with flakes (or Node 24 directly).

```sh
nix develop          # Node, npm, Playwright's Chromium + Firefox, flock
direnv allow         # or activate the flake shell automatically
npm install
npm run dev          # dev server at http://localhost:4321
npm run check        # Astro + Svelte diagnostics; any warning fails
npm run test         # unit tests (Vitest)
npm run test:e2e     # browser tests (Chromium + Firefox)
npm run test:all     # check, unit and browser tests
npm run build        # production build -> dist/
npm run preview      # serve dist/
npm run images       # regenerate responsive images (dev and build run it)
```

### Browser tests

- `test:e2e` first builds `astro.config.e2e.mjs` into `dist-e2e/`, then serves it
  on port 4322, so it runs beside `dev` and `preview`. To run Playwright
  directly, run `npm run pretest:e2e` first.
- Lightbox and carousel tests use test-only pages in `tests/e2e/pages/`, served
  under `/e2e/`, with images in `tests/e2e/images/`. The work list and the brief
  and text-only project pages are tested through fixture projects; other home,
  work and contact tests use the real content.
- `/e2e/project/` is frozen: tests address its images by position (`#image-N`).
  For a new case, add a fixture entry in `tests/e2e/pages/[fixture].astro`
  instead of inserting images there.

## Where things are

| Path | What |
|------|------|
| `src/content/projects/*.md` | one file per project; the filename is the URL |
| `src/content/singletons/` | `site.md`, `home.md`, `contact.md` |
| `public/uploads/` | uploaded originals |
| `src/content.config.ts` + `.pages.yml` | content schema: build and CMS (keep in sync) |
| `src/i18n.ts` | baked-in UI labels |
| `src/layouts/Base.astro` | page shell; language, theme and reveal scripts |
| `src/components/Gallery.svelte`, `Lightbox*.svelte`, `lightbox-*.ts`, `gallery.ts` | the project lightbox |
| `src/components/Carousel.astro`, `ProjectBlocks.astro` | home and project carousels |
| `scripts/generate-responsive-images.ts` | image pipeline → `public/_responsive/` (gitignored) |
| `tests/e2e/` | browser tests and their pages |
| `.github/workflows/deploy.yml` | test, build, deploy |

## Common changes

**Change the content shape.** Edit `src/content.config.ts` and `.pages.yml` in
the same change; the content-schema test fails if their fields or required flags
differ. Translatable fields come as `_cs`/`_en` pairs in both places.

**Add UI text.** Add a key with both languages to `src/i18n.ts` and render it
with `<T k="key" />`. Bilingual content renders with `<T cs={…} en={…} />` or
`<Prose cs={…} en={…} />`, never as a bare string.

**Add a project by hand.** Copy an existing file in `src/content/projects/`, put
images in `public/uploads/` and reference them as `/uploads/<file>`. The owner
normally does this in the CMS.

**Change the domain.** Edit `public/CNAME` and `site` in `astro.config.mjs`,
then the domain under GitHub **Settings → Pages** and its DNS.

**Add an island.** Keep it small and record why in ARCHITECTURE.md; the lightbox
is the only hydrated component, and the rest is small vanilla scripts.

## Known gaps

- **`@playwright/test` is pinned to the flake's Playwright.** After
  `nix flake update`, set the pin to
  `nix eval --raw --inputs-from . nixpkgs#playwright-driver.version`.
- **`typescript` stays on 6.x** until `@astrojs/check` and `svelte-check`
  accept TypeScript 7.
- **`@types/node` stays on Node's major** (24), to describe the runtime the
  scripts use.

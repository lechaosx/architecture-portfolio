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
  under `/e2e/`, `/cs/e2e/` and `/en/e2e/`, with images in `tests/e2e/images/`. The work page's index and
  the brief, credits and text-only project pages are tested through fixture
  projects, the landing and About pages through fixture data; other landing,
  About, work and footer tests use the real content.
- Thumbnail fixtures also render at `/projects/e2e-thumbnail-…/` and both language-prefixed equivalents so their cards
  navigate through the production project-page component.
- `/e2e/project/` is frozen: tests address its images by position (`#image-N`).
  For a new case, add a fixture entry in `tests/e2e/pages/[fixture].astro`
  instead of inserting images there.

## Where things are

| Path | What |
|------|------|
| `src/content/projects/*.md` | one file per project; the filename is the URL |
| `src/content/singletons/` | `site.md`, `landing.md` (the landing page's images), `about.md`, `contact.md` (the footer's contacts and the landing page's location) |
| `public/uploads/` | uploaded originals |
| `src/content.config.ts` + `.pages.yml` | content schema: build and CMS (keep in sync) |
| `src/i18n.ts` | baked-in UI labels |
| `src/locale.ts`, `src/pages/[lang]/` | language selection, translated page paths and static locale routes |
| `src/one-letter-words.ts` | Czech one-letter words kept off line ends, applied where text renders |
| `src/period.ts` | project and About periods: the date format, checks, display and project order |
| `src/layouts/Base.astro` | page shell; language, theme and reveal scripts |
| `src/components/LandingPage.astro`, `WorkPage.astro`, `AboutPage.astro`, `ProjectPage.astro` | the pages, also rendered by the e2e fixtures |
| `src/components/ProjectGrid.astro` | the project cards, on Work and the landing page |
| `src/components/Carousel.astro` | the carousel of project image sets and the landing images |
| `src/structured-data.ts`, `src/llms-txt.ts` | JSON-LD, bilingual `/llms.txt` index and `/llms-full.txt` export, built from content |
| `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts`, `src/pages/robots.txt.ts` | static text endpoints |
| `src/components/Gallery.svelte`, `Lightbox*.svelte`, `lightbox-*.ts`, `gallery.ts` | the project lightbox |
| `src/components/ProjectBlocks.astro` | project blocks |
| `src/project-facts.ts`, `src/components/ProjectFacts.astro` | project badges and facts: involvement, classification, credits and award |
| `scripts/generate-responsive-images.ts` | image pipeline → `public/_responsive/` (gitignored) |
| `tests/e2e/` | browser tests and their pages |
| `.github/workflows/deploy.yml` | test, build, deploy |

## Common changes

**Change the content shape.** Edit `src/content.config.ts` and `.pages.yml` in
the same change; the content-schema test fails if their fields or required flags
differ. Translatable fields come as `_cs`/`_en` pairs in both places. Labels,
help texts and option labels in `.pages.yml` are Czech, a pair's labels ending
"(česky)" / "(anglicky)".

**Translate content.** Fill both `_cs`/`_en` fields, including captions, roles
and nested descriptions, or leave both empty when optional. Whitespace is empty.
The build reports incomplete pairs at their field paths and prevents deployment;
Pages CMS can save them, so check the deployment result after editing.

**Add a page.** Provide the neutral route and both static language variants through `src/pages/[lang]/`; use `localizedPath(path, lang)` for page links and keep assets rooted at `/uploads/…`. Check its canonical, alternate language links and sitemap entries.

**Add UI text.** Add a key with both languages to `src/i18n.ts` and render it
with `<T k="key" />`. Bilingual content renders with `<T cs={…} en={…} />` or
`<Prose cs={…} en={…} />`, never as a bare string.

**Add a project by hand.** Copy an existing file in `src/content/projects/`, put
images in `public/uploads/` and reference them as `/uploads/<file>`. The owner
normally does this in the CMS. `brief_cs` / `brief_en` introduce the project and her involvement in natural prose; optional top-level `role_cs` / `role_en` summarize her responsibilities in the same free-text format as collaborators’ roles. `from` / `to` describe her involvement period; longer project narrative belongs in `blocks`. Optional `context`, `intervention` and `scope` lists use the choices in `.pages.yml`; `design_in_progress` is independent of the single `realization` value. Select only confirmed facts. The optional `collaborators` list contains the other people involved, excluding Tereza, as records with `name` and optional paired `role_cs` / `role_en`. Her name is implicit; her work belongs in the brief and optional personal role. Fill an individual role only when it is explicitly supplied for that person; a collective team credit does not establish individual roles. Unknown roles stay unfilled.

**Choose a project thumbnail.** In Pages CMS, select **Náhled projektu**, or set
optional top-level `thumbnail: /uploads/<file>` by hand. Clear it to use the first
image in the page's blocks again. The image can be independent of the page content;
a project still needs content blocks to have a page and a card.

**Link to a project's external page.** Set optional `project_url` to its complete
HTTP or HTTPS address, shared by both languages, or leave it empty. Invalid web
addresses fail content validation during the build.

**Check AI exports.** After `npm run build`, inspect `dist/llms.txt` for the
page index and `dist/llms-full.txt` for the complete published project facts,
texts and linked image captions. Their section and language labels live in
`src/i18n.ts`; `tests/e2e/seo.spec.ts` checks the shipped content and follows
index and caption links.

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

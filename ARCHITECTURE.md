# Architecture

Why the code is shaped the way it is. For _product_ decisions see
[FEATURES.md](FEATURES.md); for how these docs are kept honest, [AGENTS.md](AGENTS.md).

- **[Explicit]** — the user asked for this by name, or chose it when offered.
- **[Implicit]** — Agent proposed it and the user did not push back.

---

## Hosting & delivery

### GitHub Pages, static output, no server — [Explicit] / [Implicit]

Hosting on GitHub Pages was asked for [Explicit]; it serves files only, so
everything renders to static HTML at build time [Implicit]. There is no runtime
backend, which is also what keeps the site fast and cheap.

### Hosting: custom domain at the root — [Explicit]

One mount point, the root of the domain in `public/CNAME`. So there is no `base`
and no link helper: internal links and assets are plain root-absolute paths.
`site` in `astro.config.mjs` is the origin of every absolute URL the build
writes. The `*.github.io/<repo>/` URL does not serve on its own, but GitHub
redirects it to the domain.

**Page URLs end in a slash** (`/work/`) — [Explicit]. GitHub Pages
301-redirects the slashless form; `astro dev` and `astro preview` answer it with
a 404, so a link missing its slash shows up locally.

### CI/CD: GitHub Actions → Pages — [Explicit]

`.github/workflows/deploy.yml` tests, builds with `withastro/action` and deploys;
content-only pushes skip the tests so CMS edits go live sooner, and the build
still validates content. A new run waits for the one in progress instead of
cancelling it, so a deploy under way always finishes; only the deploy job can
write to Pages. The test job caches `node_modules/.astro` under
`withastro/action`'s cache key, so the build reuses the test prebuild's images.

### Browser tests bring their own pages — [Explicit] (shape [Implicit])

The shipped content need not contain what a test needs, and the CMS changes it
between runs, so the lightbox and carousel tests run against test-only pages
under `/e2e/` [Explicit], and nothing in `src/` or `scripts/` knows about them
[Explicit]:

- `astro.config.e2e.mjs` merges the site config with `injectRoute`s and builds
  to `dist-e2e/`, so the test build never replaces `dist/` — [Implicit].
- The image script takes the content directory and extra image directories as
  arguments; only the test build passes the latter — [Explicit] (form
  [Implicit]). Both share `public/_responsive`: keys cannot collide, and the
  plain build's run removes the test images' derivatives — [Implicit].
- The carousel page renders a project image-set carousel with test-owned SVGs —
  [Implicit].
- `/e2e/project/` renders through `ProjectPage.astro`, from data typed against
  the projects collection. The tests rely on its images' positions, titles,
  comparison sets and descriptions [Explicit], so it is frozen and a new case
  gets its own fixture entry [Implicit]. Its images are small line drawings in
  `tests/e2e/images`, served at `/e2e/images/` — [Implicit].
- The About tests render `AboutPage.astro` with fixture data, everything filled
  and nothing optional filled — [Implicit].
- The landing tests render `LandingPage.astro` with no image, one SVG, and an
  SVG and two rasters, over fixture projects; services and the place are
  filled only where there are images — [Implicit].
- Metadata, structured-data and alt-text tests use fixture project pages; the
  `llms.txt` test checks it against the shipped projects and follows its links
  — [Implicit].
- The work page's index and the brief, credits and text-only project pages
  are tested through fixture projects; other landing, About, work-page, footer
  and transition tests use the shipped content — [Implicit].

---

## Framework & tooling

### Astro — [Implicit]

Zero JS by default, islands for the exceptions, first-class Markdown content.

### TypeScript, zero diagnostics — [Explicit]

Astro's strict tsconfig, also checking JavaScript and flagging unused code.
`npm run check` fails on any Astro error, warning or hint and on any Svelte
warning; `svelte-check` runs too because `astro check` does not look inside
`.svelte` files [Explicit]. The content schema is where types matter most.

### Node 24 and npm — [Explicit]

Node runs the TypeScript scripts directly by stripping types, so local imports
carry `.ts` extensions and `erasableSyntaxOnly` rejects enums, namespaces and
parameter properties. Vitest runs on Astro's Vite config (`getViteConfig`), so
tests can import `astro:content` as the build does.

### Minimal Nix flake — [Explicit]

Node, Chromium and Firefox from the Playwright package, and util-linux for
`flock`. The dev server ignores `.direnv` [Explicit]: direnv links all of
nixpkgs there, and watching it holds ~127k files open.

---

## Interactivity

### Islands; Svelte for the one that exists — [Implicit] / [Explicit]

Pages are static; only components that must run in the browser hydrate
[Implicit], written in Svelte [Explicit]. The only island is the project
lightbox, `Gallery.svelte`, loaded `client:load` so a pasted `#image-N` opens at
once [Implicit]. Everything else is a few small vanilla scripts: reveal, the
carousel, the language and theme switches, the project-transition tagging.

### Lightbox structure — [Explicit] (seams [Implicit])

Split along the product's concepts so each unit reads alone; the components talk
only through props and callbacks.

| Unit | Owns |
|------|------|
| `Gallery.svelte` | the state, every change of image, composing the rest |
| `lightbox-gestures.ts` | input → intents, DOM-free |
| `lightbox-history.ts` | the `#image-N` history entry |
| `gallery.ts` | geometry and motion maths |
| `LightboxCard`, `LightboxVerso`, `LightboxTiles`, `LightboxControls` | the card, its back, the OpenSeadragon canvas, the controls |

A change of image stays in `Gallery.svelte` because it moves index, view, side,
strip and address together.

### State changes instantly; the visuals chase it — [Explicit] (model [Implicit])

The invariant in AGENTS.md. In the lightbox, state (open, image, side, view,
address) changes the moment input arrives; each visual is one number a Svelte
`Tween` chases from its value on screen. Non-obvious consequences:

- Tweens, not CSS transitions: a retargeted transition's start cannot be read
  or timed, and browsers disagree on it.
- A move is stopped where it is before being sent on (`moveOn`), since a tween
  starts from its value at its next frame.
- The strip puts a target at most one slide past what is on screen, so a fast
  run never shows or loads the skipped images.
- Slides are never reordered in the DOM: moving an element loses the scroll
  position of a card's back.
- A card's images are stacked layers that are opaque once reached, so a blend
  never shows the backdrop and never passes through a skipped image.
- A blend waits for its drawing to load; the tiled canvas is created only once
  the card rests, because creating it mid-move stalls the main thread.
- The phone's edge arrows are derived from the turns on screen, not tweened
  separately, so they stay in step by construction.

The carousel keeps a slide index instead of reading it from a mid-scroll
position, which would drop a quick second press. Page View Transitions are the
one accepted exception — [Explicit]: the browser holds input during them.

### Lightbox geometry and controls — [Explicit]

`lightboxAreas` in `gallery.ts` is the one source of the layout (where the image
fits at 100%, and what pan and the zoom floor respect); CSS reads its sizes as
custom properties. The controls sit outside the stage, so no gesture or turn
moves or disables them.

### The card and its back — [Explicit]

A comparison set's images are layers of one `LightboxCard`, and every change
goes through `changeTo`, which blends or slides. The back (`LightboxVerso`) is a
native scroll container in screen space holding the turning card, because a
scroller inside the turning face would clip to a turned copy of the screen. It
takes the page's theme colours; the rest of the lightbox pins black and white.

### Lightbox input — [Explicit]

All zoom input goes through `zoomTo` and the gesture interpreter, so one rule
decides when zoom is ignored — [Implicit]. OpenSeadragon's own input,
constraints and auto-resize are off, so it only follows the lightbox's view.

### Lightbox modal and history — [Explicit]

- A native modal `<dialog>`, always in the page so it becomes modal in the click
  itself. Tab is wrapped by hand because a modal dialog still lets focus leave
  to the browser chrome.
- Opening and closing are the live dialog, not a View Transition: a View
  Transition animates snapshots, so it can neither retarget nor take input.
- Closing drops modality at once and leaves the inert dialog drawn while it
  fades, so the page takes input immediately — [Implicit].
- History: one pushed entry, replaced on navigation. Reopening waits for a
  pending Back, because Chromium and Firefox disagree on a push made during one.
  Scroll restoration is manual while the entry is active.

### Carousel: scroll-snap plus a small script — [Implicit]

Native horizontal scroll-snap with arrows and dots; no island. It scrolls its
own container, not the page. `Carousel.astro` is the frame, controls and script
for both project image sets and the landing images; the caller renders one
slide per item, which the track sizes, and only the landing page turns on
auto-advance. It shares the interaction language with the lightbox but not its
implementation.

### Circular carousel motion — [Implicit]

The scroll strip has inert copies of its boundary slides, keeping duplicate
controls out of keyboard navigation and the accessibility tree. A small
frame animation follows a circular position so wrapping and retargeting stay
continuous; native scrolling takes over on visitor input and returns to an
equivalent original slide when it settles.

### Project blocks render in Astro — [Explicit]

`ProjectBlocks.astro` renders the blocks on the server; each image button
carries its page index so the single island treats every occurrence as its own
slide. The first image of the page is the project's cover: the work card shows
it, it is the only image that loads eagerly, and it is the page's share image.

### Pages are components the e2e fixtures render — [Implicit]

`LandingPage`, `WorkPage`, `AboutPage` and `ProjectPage` each render a whole
page from the data passed in, so the e2e fixtures can render them with their
own. Their routes in `src/pages/` only load the content and pass it on.
`src/projects.ts` holds the one project order and splits the projects into
cards with a cover and the index, so the share image that falls back to the
newest cover always matches the first card, and `llms.txt` lists projects in
the same order.

### One fact-sheet model — [Implicit]

`src/project-facts.ts` turns a project into its sheet's filled rows, each a
label key and lines of names and text in both languages, marked with the one
language a row is filled in. Names stay separate items so the sheet can keep
each one whole on its line while `llms.txt` gets plain text.
`ProjectFacts.astro` renders the rows on the project page and in the work
index, the index opens a row that has any, and `llms.txt` lists them, so the
three cannot disagree. The label column has a fixed width that fits the
longest label in either language, so values line up across projects; a
container query puts labels above values where the sheet is too narrow for
that column, as the sheet is half the page on a project page and narrower in
the index.

### Footer layout follows its content — [Implicit]

A local ResizeObserver measures the contact items, copyright and switches to
choose one complete row, a centered contact row above the controls, or stacked
contacts. Intrinsic widths keep the transitions tied to the editable content
and the active language.

### Section headings own their row — [Implicit]

`SectionHeading` draws the small caps and the rule over a section of About or
the landing page, always as an `h2`: it never titles a page. Its default slot
ends the row on the same rule and inherits the small caps, so a link onward,
like the landing page's link to all work, needs no layout of its own.

### Page transitions: native View Transitions — [Implicit]

`@view-transition { navigation: auto; }`, with no client router. The name
`cover-<id>` sits on the wrapper holding the first image (for a multi-image set,
its first slide), so it does not compete with the inner image's hover scale. It
is set only when the first block is an image block. An inline `pagereveal` script tags
each navigation by whether it arrives at a project page and carries the card's
hover scale across, so a card morphs from any page that shows one, Work or the
landing page. One snapshot is drawn, because blending two crops doubles the
edges.

### The work index expands with native `<details>` — [Explicit]

A row with a brief or credits is a `<details>` whose `<summary>` is the row,
so it opens without JavaScript, from the keyboard and on find-in-page. Only
the **+**/**−** turns; the brief shows at once, with no height animation to
wait for — [Implicit].

### Reveal on scroll: IntersectionObserver — [Implicit]

No scroll library. Decoration only — [Explicit]: `.reveal` alone is visible;
the script hides only what the first observer report finds off screen.

---

## Styling

### Tailwind v4 via the Vite plugin — [Implicit]

Configured in CSS; there is no `tailwind.config`.

### CSS units and tokens — [Explicit]

Choose units by what the value should scale with:

- `rem` for type and spacing; `em` for sizes that follow a component's font
  size (never nested `font-size` in `em`); `px` for borders and hairlines;
  `%`/`fr`/`vw`/`vh` for layout; `clamp()` with `rem` bounds and a `rem + vw`
  middle; unitless `line-height`.
- Prefer Tailwind's scale and existing tokens over literals, but no token for a
  one-off. No 62.5% root font-size hack.
- Page-title headings step at `sm` instead of using `clamp()`: the fluid range
  would be narrow, and the breakpoint utility reads more plainly.

### Typography plugin, rendered with `marked` — [Implicit]

`prose` styles the Markdown bodies. They are bilingual frontmatter fields, not
the file body, so `Prose.astro` renders them with `marked`.

### One class for running text — [Implicit]

`.running-text` in `global.css` justifies and hyphenates every piece of running
text (`Prose.astro`, `Paragraphs.astro`, briefs, the lightbox back), and the
element or its wrapper carries `lang` so the browser picks the right dictionary
— [Explicit].

### One-letter words bound where Czech text is rendered — [Implicit]

`T.astro`, `Prose.astro`, `Paragraphs.astro` and the lightbox back put a no-break
space after Czech one-letter words (`src/one-letter-words.ts`), so the content
files, metadata, alt text, JSON-LD and `/llms.txt` keep the text as written.
`Prose.astro` binds the text `marked` renders as HTML, never its markup, link
targets or image alt text.

### Text columns follow the container — [Implicit]

Native CSS columns balance project text and the About bio across at most two
columns, using a font-relative minimum width so a split never makes either
column too narrow. Both render through `Prose.astro`, which holds the rule.
The minimum uses `ch` to follow the font's metrics and size; it approximates
character count for proportional text. Text fills the available width and
reflows on resize without client-side JavaScript, allowing longer single lines
until both columns fit. About’s intro grid uses the same minimum for its text
and portrait tracks, so the portrait occupies the rightmost equal column or
fills the width below the text.

### Self-hosted Roboto via @fontsource — [Implicit]

No third-party font request. One token, `--font-sans`, for everything.

### Motion durations as custom properties — [Implicit]

`--duration-fast/base/slow` on `:root`, outside `@theme` because only
hand-written CSS reads them.

### Dark mode remaps palette tokens — [Implicit]

Overriding `--color-*` under `html[data-theme="dark"]` flips every utility
without `dark:` classes, and leaves images alone, as a CSS filter would not. The
typography plugin's literal colours need `dark:prose-invert`. An inline script
picks the theme before first paint; `<html>` ships `data-theme="light"` for
no-JS.

---

## Content

### Content collections; singletons as one-entry collections — [Implicit] / [Explicit]

`src/content.config.ts` validates projects and the site, landing, about and
contact singletons [Explicit] with Zod, so a CMS edit the pages cannot render fails the
build. A field is required only when a page needs it; optional lists default to
empty — [Implicit]. Markdown file bodies are unused: bilingual text lives in
`_cs`/`_en` frontmatter.

### Images: uploads plus responsive derivatives — [Explicit]

Content refers to uploads by root-absolute path (`/uploads/…`), as the CMS
writes them. Before `dev` and `build`, `scripts/generate-responsive-images.ts`
writes WebP derivatives and a manifest to the ignored `public/_responsive`,
never enlarging or touching the original.

### Deep-zoom pyramids for large drawings — [Explicit]

Above a size threshold, a DZI pyramid of WebP tiles, each level resized straight
from the original, with tile overlap wide enough to keep lossy-codec edges out
of view. This bounds browser memory for print-sized drawings; OpenSeadragon
loads only when one opens.

### Content-addressed image cache — [Explicit]

Results are cached in `node_modules/.astro/images`, keyed by source bytes and the
whole recipe, and written atomically so an interrupted run leaves no partial
entry — [Implicit]. Each run syncs `public/_responsive` in place [Explicit] and
`src/server-images.ts` re-reads the manifest when it changes, so a running dev
server survives builds and tests — [Implicit]. Runs are serialized with `flock`
because overlapping runs delete each other's output — [Implicit]; Linux is the
only build platform.

### Image items are caption records — [Explicit]

Each gallery or image-set item keeps its image, optional bilingual title and
description, and optional `comparison_set` together, so reordering in the CMS
keeps them associated. Both block types share the shape.

### Sitemap — [Implicit]

`@astrojs/sitemap` writes `sitemap-index.xml`, using `site` for absolute URLs;
`robots.txt` points crawlers to it. The integration leaves out the 404 page
itself.

---

## Search & machine-readable output

### Page metadata flows into `Base.astro` — [Implicit]

A page passes `Base` only what it knows about itself: a description, a share
image, its Open Graph type, its structured-data nodes and, for the 404 page,
`noindex`. `Base` derives the canonical address from `site` and the path (none
for a `noindex` page), adds the architect's node and writes the title,
description, canonical, Open Graph and Twitter tags, falling back to the site
description, so every page gets the same head.

### Share images come from the responsive pipeline — [Implicit]

The image script also writes each raster as a JPEG about 1200px wide, flattened
onto white, because LinkedIn is reported to drop WebP previews.

### JSON-LD from pure functions — [Implicit]

Pure functions in `src/structured-data.ts` turn content into schema.org nodes,
which `Base` inlines as one `@graph` per page. Text is plain Czech, because
Google documents only plain-text values for these properties, not
language-tagged ones. Her location is `Person.workLocation`, a `Place`.
Credentials are named "programme, school (period)" and awards "award, placement
(period)"; `award` is plain text. A project's `dateCreated` is the end of its
period in ISO 8601 ("2024", "2024-06"), when her work on it was done, so an
ongoing project has none. Its `creator` is her, then the studio as an
`Organization` and the team as `Person`s, leaving out her own name; each
collaborator is a `contributor`, wrapped in a `Role` when a Czech role is
filled. Its award is `award` and its status `creativeWorkStatus`, as text.

### `llms.txt` and `robots.txt` as static endpoints — [Implicit]

`src/pages/llms.txt.ts` renders at build time through the pure
`src/llms-txt.ts`, from the same content as the pages, so it cannot drift from
them and needs no server. `src/pages/robots.txt.ts` builds the sitemap's URL
from `site`, so the domain is written only in `site` and `public/CNAME`.

---

## Internationalization

### Both languages in one page; CSS picks — [Explicit] (shape [Implicit])

No `/cs` or `/en` routes: that keeps root-only hosting and lets a static host
default to the browser's language with no server. Every page renders both;
`html[data-lang]` hides the other. Switching is instant and search engines see
both. `<html>` ships `data-lang="cs"` with the Czech title, description and
Open Graph tags, so crawlers that read the raw HTML, link previews and no-JS
visitors get the source language; the inline script then picks the visitor's.

### Language picked by an inline script — [Implicit]

An `is:inline` head script sets `data-lang` and the tab title before first
paint; a module script in `Base.astro` wires the toggle and syncs `<title>`, the
meta description and image alt text. On a toggle it synchronously notifies the
footer to recompute its layout, then compensates scroll by the button’s
change in position, preserving the activated control through translation
reflow — [Implicit].

### Bilingual alt text: one attribute, swapped — [Implicit]

An image cannot be doubled per language like text, so a project image ships its
Czech title as `alt`, with both titles in `data-cs`/`data-en`, and the language
script sets `alt` from them. The lightbox sets it from its own language state.

### Strings: `i18n.ts`, `T.astro`, `Prose.astro`, `Paragraphs.astro` — [Implicit]

UI labels are a `{ cs, en }` dictionary in `src/i18n.ts`. `T.astro`,
`Prose.astro` and `Paragraphs.astro` emit one element per language with a
`lang` attribute: `T` a string, `Prose` Markdown, `Paragraphs` plain text split
into one `<p>` per paragraph (Approach texts and fact descriptions).

### Paired `_cs`/`_en` fields — [Implicit]

One file and one CMS form per entry; language-neutral fields (images, period
dates, email, phone, a project's studio, team and collaborators' names) stay
single. A project's status stores a stable value, labelled in `src/i18n.ts`
under the same key. The project route is the filename-derived content
ID, so the filename is the only source of the slug.

---

## Content management

### Pages CMS, hosted — [Explicit]

Schema in `.pages.yml`; the hosted editor at app.pagescms.org handles GitHub
sign-in, so the site needs no auth server.

### Two sources of truth for content shape — [Implicit] (constraint to respect)

The shape is declared in `src/content.config.ts` (build) and `.pages.yml`
(editor) and kept in sync by hand. Pages CMS fields are optional unless
`required: true`, so `src/content.config.test.ts` checks that both declare the
same fields, required in the same places, at every level, and that each
singleton file is valid.

### A period is two date strings — [Explicit] (module [Implicit])

Pages CMS has no conditional fields or cross-field validation, so each end of a
period is one string, "2023" or "3/2023", whose `pattern` lets the CMS refuse a
malformed date. That pattern also takes the empty string, the value of an
empty optional field in its form, and `src/content.config.test.ts` checks it
against `DATE`. `src/period.ts` holds the rest: the cross-field checks the
build runs, the display and the project order.

### Empty block rows are dropped — [Explicit]

Pages CMS can write a blank row as `{}`; the schema removes completely empty
rows before validating.

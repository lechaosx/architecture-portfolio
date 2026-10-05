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
`site` in `astro.config.mjs` feeds only the sitemap. The `*.github.io/<repo>/`
URL does not serve on its own, but GitHub redirects it to the domain.

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
- The carousel pages render the carousel components with test-owned SVGs —
  [Implicit].
- `/e2e/project/` renders through `ProjectPage.astro`, from data typed against
  the projects collection. The tests rely on its images' positions, titles,
  comparison sets and descriptions [Explicit], so it is frozen and a new case
  gets its own fixture entry [Implicit]. Its images are small line drawings in
  `tests/e2e/images`, served at `/e2e/images/` — [Implicit].
- Home, work-page and transition tests use the shipped content — [Implicit].

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
carousels, the language and theme switches, the project-transition tagging.

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

The carousels keep a slide index instead of reading it from a mid-scroll
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

### Carousels: scroll-snap plus a small script — [Implicit]

Native horizontal scroll-snap with arrows, dots and (home only) auto-advance;
no island. It scrolls its own container, not the page. The home and project
carousels keep separate scripts — [Implicit]. They share the interaction
language with the lightbox but not its implementation.

### Project blocks render in Astro — [Explicit]

`ProjectBlocks.astro` renders the blocks on the server; each image button
carries its page index so the single island treats every occurrence as its own
slide. The first image of the page is the project's cover: the work card shows
it and it is the only image that loads eagerly.

### Work page: one component for grid and list — [Implicit]

`WorkProjects.astro` sorts the projects and renders the grid and the list; it is
a component so the e2e fixtures can render it with their own projects.

### Page transitions: native View Transitions — [Implicit]

`@view-transition { navigation: auto; }`, with no client router. The name
`cover-<id>` sits on the wrapper holding the first image (for a multi-image set,
its first slide), so it does not compete with the inner image's hover scale. It
is set only when the first block is an image block. An inline `pagereveal` script tags
each navigation and carries the card's hover scale across. One snapshot is
drawn, because blending two crops doubles the edges.

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
the file body, so `Prose.astro` renders them with `marked`. `.prose` justifies
and hyphenates, and each language's wrapper carries its `lang` so the browser
picks the right dictionary — [Explicit].

### Project text columns follow the container — [Implicit]

Native CSS columns balance project text across at most two columns, using a
font-relative minimum width so a split never makes either column too narrow.
The minimum uses `ch` to follow the font's metrics and size; it approximates
character count for proportional text. Text fills the available width and
reflows on resize without client-side JavaScript, allowing longer single lines
until both columns fit.

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

`src/content.config.ts` validates projects and the site, home and contact
singletons [Explicit] with Zod, so a CMS edit the pages cannot render fails the
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

`@astrojs/sitemap`, using `site` for absolute URLs.

---

## Internationalization

### Both languages in one page; CSS picks — [Explicit] (shape [Implicit])

No `/cs` or `/en` routes: that keeps root-only hosting and lets a static host
default to the browser's language with no server. Every page renders both;
`html[data-lang]` hides the other. Switching is instant and search engines see
both. `<html>` ships `data-lang="en"` for no-JS.

### Language picked by an inline script — [Implicit]

An `is:inline` head script sets `data-lang` before first paint; a module script
in `Base.astro` wires the toggle and syncs `<title>` and the meta description.

### Strings: `i18n.ts`, `T.astro`, `Prose.astro` — [Implicit]

UI labels are a `{ cs, en }` dictionary in `src/i18n.ts`. `T.astro` and
`Prose.astro` emit one element per language with a `lang` attribute.

### Paired `_cs`/`_en` fields — [Implicit]

One file and one CMS form per entry; language-neutral fields (images, year,
email, phone) stay single. The project route is the filename-derived content
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

### Empty block rows are dropped — [Explicit]

Pages CMS can write a blank row as `{}`; the schema removes completely empty
rows before validating.

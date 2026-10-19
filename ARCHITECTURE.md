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
and assets use root-absolute paths; page links include their language prefix through `src/locale.ts`.
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
  AI export tests check both text endpoints against the shipped projects and
  follow their links — [Explicit].
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

### Lightbox header crop — [Implicit]

The thumbnail morph keeps its full frame even when partly obscured. A separate
screen-space crop opens from the sticky header’s lower edge, so the
hidden image is revealed continuously while the backdrop dims the header; the
same geometry follows closing and reversals. The input stage stays uncropped so
gestures work across the screen throughout the transition.

### Lightbox thumbnail handoff — [Implicit]

Thumbnail opacity follows the card’s displayed opening progress in both
directions, so reversing the movement preserves its visibility. A settled card
returns directly to its destination frame; retargeting a moving card starts
from its current frame. During return, each animation frame remeasures the
destination’s geometry so scrolling, resizing and header clipping stay aligned.

### Hold thumbnail hover during return — [Explicit] (lifecycle ownership [Implicit])

After modality drops, the return effect hit-tests the pointer and holds the
destination at its CSS hover target. The same effect follows the thumbnail’s
geometry and restores its styles when the return ends or is interrupted, keeping
the temporary hover state local to that movement. On release, the native CSS
transition eases toward the latest pointer state.

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

### Carousel motion and lazy images — [Implicit]

Empty snap cells keep a full native scroll surface while only the visible
original slides and the next destination occupy it. A frame animation places
the latest target just beyond the visible pair, so rapid changes skip unused
images and the lightbox always receives the original thumbnail. Native gestures
keep browser momentum and snapping; the strip recenters when it settles.
Mouse dragging moves the same native scroll surface with pointer capture,
then hands settling back to the carousel animation — [Implicit].

### Project blocks render in Astro — [Explicit]

`ProjectBlocks.astro` renders the blocks on the server; each image button
carries its page index so the single island treats every occurrence as its own
slide. The first page image loads eagerly regardless of the selected cover.
The shared cover selection in `src/projects.ts` uses the optional `thumbnail`
or the first page image, retaining a matching page image's caption metadata for
cards, share previews and structured data — [Implicit].

### Pages are components the e2e fixtures render — [Implicit]

`LandingPage`, `WorkPage`, `AboutPage` and `ProjectPage` each render a whole
page from the data passed in, so the e2e fixtures can render them with their
own. Their routes in `src/pages/` only load the content and pass it on.
`src/projects.ts` holds the one project order and splits the projects into
cards with a cover and the index, so the share image that falls back to the
newest cover always matches the first card, and both AI exports list projects in
the same order.

### One project metadata model — [Implicit]

`src/project-facts.ts` supplies filled fact rows and title badge keys to the project page, the work index and `llms-full.txt`. Optional top-level `role_cs` / `role_en` describe the architect’s responsibilities, while each `collaborators` record keeps another contributor’s name and optional bilingual role; an external project link keeps its full destination separately from its displayed hostname. One static Astro badge component renders title and fact-sheet categories without client state; native columns balance intact fact rows, with labels above values in narrow sheets and collaborators in a semantic people list with secondary roles.

### Controlled project classification — [Explicit] (shape [Implicit])

Context, intervention and scope are optional controlled lists; current design activity is a separate boolean, and realization is one optional enum. Pages CMS uses multi-selects for the lists and a single select for realization, matching content validation. The brief, personal role and credits describe involvement independently of classification.

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
is set on both card and page only when the selected cover matches that image
and the first block is an image block. Other covers remain in the page crossfade.
An inline `pagereveal` script tags
each navigation by whether it arrives at a project page and carries the card's
hover scale across, so a card morphs from any page that shows one, Work or the
landing page. One snapshot is drawn, because blending two crops doubles the
edges.

### The work index expands with native `<details>` — [Explicit]

A row with a brief, facts or badges is a `<details>` whose `<summary>` is the row,
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
text (`Prose.astro`, `Paragraphs.astro`, `PlainProse.astro`, the lightbox back), and the
element or its wrapper carries `lang` so the browser picks the right dictionary
— [Explicit].

### One-letter words bound where Czech text is rendered — [Implicit]

`T.astro`, `Prose.astro`, `Paragraphs.astro`, `PlainProse.astro` and the lightbox back put a no-break
space after Czech one-letter words (`src/one-letter-words.ts`), so the content
files, metadata, alt text, JSON-LD and both AI exports keep the text as written.
`Prose.astro` binds the text `marked` renders as HTML, never its markup, link
targets or image alt text.

### Prose length enables native columns — [Implicit]

A shared word-count decision enables the same native CSS column rule in every
prose renderer; Markdown is counted after rendering so markup and image metadata
do not inflate its length. Short blocks fill their container, while longer blocks
balance across at most two columns only when each keeps a font-relative minimum
width, without client-side measurement. About’s equal-width text and portrait
tracks retain their own responsive layout; project facts occupy the full width
below the brief, and the lightbox retains its card’s existing column limit.

### Self-hosted Roboto via @fontsource — [Implicit]

No third-party font request. One token, `--font-sans`, for everything.

### Motion durations as custom properties — [Implicit]

`--duration-fast/base/slow` on `:root`, outside `@theme` because only
hand-written CSS reads them.

### Dark mode remaps palette tokens — [Implicit]

Overriding `--color-*` under `html[data-theme="dark"]` gives the dark theme its
own monochrome palette. Structural borders use `--color-rule` so quiet
dividers and high-contrast controls can differ. The typography plugin uses
`dark:prose-invert`, with its body colour tied to the adjacent text. An inline
script picks the theme before first paint; `<html>` ships `data-theme="light"`
for no-JS.

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
which `Base` inlines as one `@graph` per page. Text follows the page language as plain strings; the architect keeps one shared Person identity across languages. Awards are plain text named "award, placement (period)".

### Structured data preserves supplied meaning — [Implicit]

Project sites use `contentLocation`; `contributor` links the architect’s Person node and lists collaborators, preserving supplied personal and collaborator roles through schema.org `Role`, while realization supplies `creativeWorkStatus`.
Studies, a generic contact area and website languages do not establish awarded credentials, a workplace or personal language proficiency.
Personal involvement dates do not establish a project creation date, and free-text roles and studio credits do not establish a creator relationship.

### AI exports and `robots.txt` as static endpoints — [Implicit]

`src/pages/llms.txt.ts` and `src/pages/llms-full.txt.ts` render at build time
through the pure `src/llms-txt.ts`, from the same content as the pages, so
content edits update both exports without a server. `src/pages/robots.txt.ts`
builds the sitemap's URL from `site`, so the domain is written only in `site`
and `public/CNAME`.

### Bilingual AI index and complete export — [Explicit]

`/llms.txt` follows the [llms.txt proposal](https://llmstxt.org/): a name,
summary, language guidance and H2 sections containing only annotated Markdown
links, with short project notes drawn from location and involvement period.
`/llms-full.txt` retains the full content with language-labelled prose and
absolute links for titled or described images; both exports use the same
canonical origin and project order as the pages, and `Base.astro` advertises
`/llms.txt` through `rel="describedby"`.

---

## Internationalization

### Symmetric static language routes — [Explicit]

Czech pages live under `/cs/` and English pages under `/en/`; each renders its own content, metadata and image alt text at build time, including without JavaScript. `src/locale.ts` supplies shared path and preference rules; thin route files reuse the same page components.

### Neutral routes detect language without a selection screen — [Explicit]

Original unprefixed pages retain English content as a useful no-JavaScript fallback, canonicalize to the English equivalent, and use a head script to replace the URL with the saved language, first supported browser language or English fallback. Query strings and anchors survive, and explicit language routes always take precedence over preferences.

### Language switches are ordinary page links — [Explicit]

The footer and viewer link to the equivalent translated route and remember an explicit choice; navigation stays within the URL's language. Viewer links carry the selected image anchor, so the translated page reopens that image; ordinary browser navigation supplies Back and open-in-new-tab behavior.

### A bilingual shell for the static 404 — [Implicit]

GitHub Pages serves one error document for every unknown URL, so only this shell includes both translations and chooses from the actual URL before saved or browser preferences. It keeps the requested URL and 404 status; its language link changes the prefix of that unknown URL, and its home link points to the selected language's landing page.

### Canonical languages and alternates — [Explicit]

Each localized page has a self-canonical address, reciprocal `cs` and `en` alternates, and an `x-default` pointing to its neutral equivalent. The sitemap includes only canonical language routes; the 404 and neutral duplicates stay out, while AI exports link directly to both canonical languages.

### Strings: `i18n.ts`, `T.astro`, `Prose.astro`, `Paragraphs.astro` — [Implicit]

UI labels are a `{ cs, en }` dictionary in `src/i18n.ts`. Translation components select the route language and emit a matching `lang` attribute: `T` a string, `Prose` Markdown, `Paragraphs` plain text split into one `<p>` per paragraph (Approach texts and fact descriptions).

### Paired `_cs`/`_en` fields — [Implicit]

One file and one CMS form per entry; language-neutral fields (images, period
dates, email, phone, a project's studio and collaborators’ names) stay
single. Project classification stores stable values, labelled in `src/i18n.ts`
under the same keys. The project route is the filename-derived content
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
committed content file is valid.

### Conditional bilingual validation — [Explicit]

A shared collection refinement checks `_cs`/`_en` string pairs throughout
nested content and reports the missing counterpart's field path. Pages CMS
cannot validate dependencies between the flat fields, so its help explains the
rule and the build enforces it before deployment; optional pairs can both be empty.

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

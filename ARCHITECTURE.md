# Architecture

Why the code is shaped the way it is. Each decision is tagged:

- **[Explicit]** — the user asked for this by name, or chose it when offered.
- **[Implicit]** — Agent proposed it and the user did not push back.

See [FEATURES.md](FEATURES.md) for _product_ decisions (why it behaves this
way). See [AGENTS.md](AGENTS.md) for how these docs are kept honest.

---

## Hosting & delivery

### Static site, no server — [Implicit]

Everything renders to static HTML/CSS at build time; there is no runtime backend.
This follows directly from the explicit choice to host on GitHub Pages, which
serves files only. It is also what makes the site fast and cheap.

### Host: GitHub Pages — [Explicit]

The user asked to host on GitHub Pages "ideally". This constrains several other
decisions (static output, the CMS auth story, the deploy workflow).

### Hosting: custom domain at the root — [Explicit]

The site is served from a single custom domain at the root (`/`). The user first
asked that the GitHub Pages project URL (`https://<owner>.github.io/<repo>/`)
work too, but later gave up dual-URL support to keep the setup simple. Choosing
the root as the only mount point is what makes the code simple:

- There is **no `base`** to configure — at the root, plain root-absolute paths
  (`/about`, `/uploads/…`, `/favicon.svg`) just work, both in `astro dev` and in
  the build. No `withBase()` helper, no per-target config, no dev override.
- **The custom domain is committed as `public/CNAME`** (a static file Astro
  copies to `dist/`). No build hook generates it.
- `astro.config.mjs` sets a single hardcoded `site` (the canonical origin) and
  registers the Svelte, sitemap, and Tailwind integrations — nothing else.
- `site` feeds only the sitemap's absolute URLs (SEO — see below).

Trade-off given up: the bare `*.github.io/<repo>/` URL doesn't serve correctly on
its own (its assets would need a `/<repo>/` prefix). This is fine because once the
custom domain is configured, GitHub Pages 301-redirects that URL to the domain, so
visitors still land in the right place.

### CI/CD: GitHub Actions → Pages — [Explicit]

`.github/workflows/deploy.yml` runs static analysis, unit tests, and Chromium and
Firefox interaction tests, builds with `withastro/action` (configured for bun),
and deploys via `actions/deploy-pages`; a push to `master` is the trigger. Pushes
whose complete diff is confined to `src/content/**` and `public/uploads/**` skip
the test steps but still build and deploy, keeping CMS edit cycles short while
retaining Astro content validation and responsive-image generation. Mixed
changes and manual workflow runs execute the full suite. The test job and Astro
build action share the same `node_modules/.astro` cache key, so the browser-test
prebuild populates the cache consumed by the deployment build.

---

## Framework & language

### Static site generator: Astro — [Implicit]

Proposed as the best fit for an image-heavy, mostly-static portfolio: ships zero
JS by default, supports partial hydration ("islands"), first-class Markdown
content. The user accepted the recommended stack without pushback.

### Language: TypeScript — [Explicit]

Chosen from the offered options (over plain JavaScript). Uses Astro's `strict`
tsconfig. `bun run check` runs Astro's project checker across Astro, Svelte,
TypeScript, and JavaScript sources and fails on errors, warnings, or hints. The
tsconfig also checks JavaScript and reports unused or unreachable code so config
files and scripts are held to the same zero-diagnostic rule. The content schema
in `src/content.config.ts` is the main place types earn their keep — [Explicit].

### Runtime / package manager: bun — [Explicit]

The user named bun ("use bun instead of node") and delegated the final call;
Agent confirmed it as a good fit. Used only at build/dev time — nothing bun-
specific ships to production.

### Dev environment: minimal Nix flake — [Explicit]

`flake.nix` provides bun and the pinned Playwright browser package for
`x86_64-linux`. It sets only the browser path needed by the test runner and has
no description. `.gitignore` was likewise trimmed on request.

---

## Interactivity

### Islands architecture (mostly static, hydrate the exceptions) — [Implicit]

Pages are static HTML; only components that need to run in the browser are
hydrated. This keeps the JS payload tiny.

### Interactive components in Svelte — [Explicit]

The user chose Svelte for the interactive parts. In practice that is a single
component today (`src/components/Gallery.svelte`).

### The lightbox is the only browser-side JS — [Implicit]

`Gallery.svelte` (the project image lightbox) is the sole hydrated island
(`client:load`). Loading it with the project page lets a pasted image hash open
without waiting for an image trigger to enter the viewport; OpenSeadragon still
loads only when a tiled image is opened. `ProjectBlocks.astro` renders those
triggers on the server; the island attaches their lightbox behavior at load so
multiple blocks still share one dialog and navigation state. The only other
browser JS is a few tiny first-party vanilla scripts (reveal-on-scroll, the home
and project image-set carousels, and the language switch). Native
cross-document View Transitions add no client router or framework runtime.
Images up to 4096 px use local transforms constrained to the image stage;
larger images lazy-load OpenSeadragon as a separate chunk and use its tiled
canvas. Desktop side gutters keep either stage separate from the navigation
controls; the mobile grid moves those controls into a row below the stage. A
fixed-height, full-stage-width, independently scrollable caption row keeps the
stage dimensions stable across gallery entries and prevents text length from
changing image selection or apparent size. Both rendering paths support
pointer-centred wheel zoom, touch pinch and pan, and constrain maximum zoom to
native image detail. At the base scale, horizontal mouse and one-finger gestures
drive the same animated navigation. Svelte's window primitives update image
selection when viewport size or display density changes; a live media query
applies reduced-motion changes immediately. Gesture distance remains separate
from its rendered
offset so reduced-motion swipes can retain their navigation threshold without
moving the slide. Previous, current, and next processed previews are
neighboring DOM slides rather than an explicit JavaScript cache;
one translation moves them as a continuous strip. The caption uses the same
three-slide geometry. Image gesture listeners remain confined to the stage;
the caption retains native scrolling while the surrounding dialog contains
page-scroll gestures. A live status element reports the current gallery position
without participating in the translated image/caption strip.

Images with the same non-empty `comparison_set` expose centred toolbar controls.
They share the main control row from the medium breakpoint upward and occupy a
full-width second row below it on narrow screens. The strip scrolls horizontally
when its intrinsic width exceeds its grid area, and a reactive effect centres the
active button after opening or switching images. That path updates the active
page index without calling the normal slide
navigation or resetting the shared scale/pan state. The incoming processed
preview is decoded first; outgoing and incoming preview layers then crossfade at
the retained transform. The active image still initializes its ordinary full-
image or OpenSeadragon renderer, and the temporary outgoing layer is removed
after the blend. While a set member is active, the wheel and pinch ceiling is the
minimum `nativeZoomScale` across the set's responsive sources. Reduced-motion
mode switches immediately.

### Shared lightbox input and tiled rendering — [Explicit]

The component owns one scale/pan gesture state for both paths. OpenSeadragon's
mouse, touch, and keyboard navigation is disabled; its viewport receives the
shared state with immediate updates and remains responsible for tile selection,
loading, caching, and drawing. A pyramid `minPixelRatio` of `0.5` selects the
closest DZI level at or above the required physical-pixel density instead of
upscaling the level below it. OpenSeadragon caches display density at module
scope, so each new viewer refreshes that value before sizing its canvas; this
covers browser-zoom changes made while no viewer exists. Tiled images retain
that density-matched processed preview beneath the canvas, preventing unloaded
tile regions from exposing the dark stage.

### Lightbox modal state — [Explicit]

The lightbox is a native modal `<dialog>`, so the browser owns the top layer,
focus containment, and Escape handling. Focus enters the close control and
returns to the opening thumbnail without scrolling the page on close. The
viewport-filling dialog suppresses wheel, touch, and keyboard scrolling without
changing document overflow or positioning, except for native scrolling inside
an overflowing caption. The page and sticky header therefore retain their
normal layout and position beneath it. The lightbox locally pins
black and white colour tokens so the global dark-mode swap cannot invert its
overlay and controls. A `data-lang` observer keeps the dialog's accessible names
aligned with the global language switch.

Opening and closing use a same-document View Transition between the stable
thumbnail frame and active preview. The image remains nested inside the named
thumbnail frame, so its hover transform cannot change the shared transition
geometry. The current hover scale is frozen at click and applied to the opening
snapshot, including midway through the hover transition. Image width and height
metadata reserve geometry before a first download. The active preview's
dimensions come from the source aspect ratio and measured stage, so cached image
and tiled-renderer state cannot change the endpoint. The image pair clips the
destination snapshot on opening and the source snapshot on closing while its box
changes aspect ratio. Using one image snapshot avoids doubled edges from blending
different crop states; the document snapshot supplies the overlay fade.
The image morph runs only when the thumbnail is inside the viewport and does not
overlap the sticky header. A clipped or header-overlapped thumbnail uses the
document fade, avoiding the stacking discontinuity created when a View
Transition isolates it above the header.
Page-transition elements opt out while this lightbox-only transition is active,
so their snapshots remain in the document's normal stacking order beneath the
header and overlay. The tiled renderer starts after opening finishes so its
canvas cannot appear beneath the moving image. Image gestures and window-level
wheel or touch scrolling are captured during the shared transition, keeping both
endpoints fixed without changing document layout. A zoomed preview is not a
matching shared element, so closing it uses only the document fade. Reduced-motion
visitors use the immediate state change. Each translated slide clips its own
contents, so a transformed image cannot paint over the adjacent slide.

Each image maps to a one-based `#image-N` hash. Opening pushes one marked
history entry; navigation replaces that entry, and the popstate handler closes
or restores the lightbox for Back and Forward. The island selects manual browser
scroll restoration while its history entry is active, preventing hash traversal
from moving the page behind the overlay, and restores the previous setting when
the lightbox closes. On initial hydration, a valid image hash is placed after a
base-page entry so Back first closes a directly linked lightbox. Image numbers
intentionally follow page order, starting with the cover, and therefore change
if the content owner reorders blocks or their images.

### Home-page carousel: scroll-snap + a small vanilla script — [Implicit]

The carousel (`Carousel.astro`) is a native horizontal scroll-snap strip; a small
vanilla script enhances it with arrows, dot indicators and a 5s auto-advance,
pausing on hover/focus and skipping auto-advance under `prefers-reduced-motion`.
The live media query updates both scrolling and auto-advance when the preference
changes. Normal document navigation gives each page one script lifetime, so no
client-router cleanup lifecycle is needed. No hydrated island — the same lightweight approach as the reveal
script, so the "islands stay minimal" invariant holds. Because it scrolls its
own container (not the page), it stays clear of the "don't reimplement scrolling"
boundary. Images come only from the Home singleton's required `gallery` list. A
single entry renders as a normal responsive image at its natural aspect ratio;
two or more entries render through the carousel. The carousel and lightbox share
only the global `.media-navigation-button` visual contract; their native
scroll-snap and Svelte gesture/navigation implementations remain independent.
Dots retain the same interaction language but use literal media-surface colours,
including a dark edge for contrast over pale images, rather than inheriting
page-theme tokens.

### Project media blocks render in Astro — [Explicit]

`ProjectBlocks.astro` renders the ordered text, gallery, and image-set sequence
without hydrating the full project body. The project page uses the shared
`max-w-6xl` frame; text blocks are constrained to `max-w-2xl` below the `lg`
breakpoint and use two columns across the full frame from `lg` onward. Cover and
media blocks use the full frame at every width. Gallery items use the existing
square thumbnail treatment. A one-item image set keeps the source aspect ratio
at the project content width; a multi-item set uses a fixed 16:9 scroll-snap
viewport with `object-contain`, arrows, and dots so drawings are not cropped.
Its small vanilla script supports every carousel block on the page and does not
autoplay.
Every rendered image button exposes its flattened page index to the single
`Gallery.svelte` island. Before responsive-image lookup, `uniqueProjectImages`
deduplicates exact image paths by their last occurrence and returns both the
unique sequence and an occurrence-to-lightbox index map. That map keeps earlier
copies clickable without duplicating their responsive metadata or lightbox
slide; the island's DOM-order trigger registration makes the last copy the
transition target.

### Page transitions: native View Transitions API — [Implicit]

`@view-transition { navigation: auto; }` opts ordinary same-origin document
navigations into the browser's cross-document View Transitions. Pages remain a
normal multi-page site: there is no client router, swapped DOM, persistence API,
or script reinitialization lifecycle. Browsers without support perform ordinary
navigation. Project covers use matching transition names between the work grid
and project pages. A stable square wrapper owns that name while the nested image
owns hover scaling, so hover and shared-element geometry do not compete. The
project image carries its native dimensions so an uncached destination has
stable geometry. One shared transition class keeps the image snapshots covering
the changing box, progressively cropping or revealing them between the square
card and the project image. Work cards skip the independent reveal effect because
starting a second entrance animation during the page transition produces
competing motion.

### Reveal-on-scroll: IntersectionObserver on the native scrollbar — [Implicit]

Elements with `.reveal` fade in as they enter the viewport (script in
`Base.astro`, styles in `global.css`). This explicitly avoids scroll-hijacking
libraries — the user asked not to reimplement scrolling. It initializes once
for each normally loaded document and respects `prefers-reduced-motion`.

---

## Styling

### Tailwind CSS v4 via the Vite plugin — [Implicit]

`@tailwindcss/vite` plus `@import "tailwindcss"` in `global.css`. No
`tailwind.config` file — v4 is configured in CSS.

### CSS unit & token conventions — [Explicit]

Pick units by what the value should scale with, not by habit. Tailwind's default
scales already follow most of this (its `text-*`/`p-*`/`gap-*` utilities are
`rem`-based), so staying on the utility scale is the path of least resistance;
these rules govern the arbitrary values and the custom CSS in `global.css`.

- **`rem`** — typography and spacing. Scales with the user's root font size.
- **`em`** — sizing that should scale with the component's own font size (e.g.
  padding on a button). Avoid setting `font-size` in `em` on nested elements —
  that compounds through the cascade. Non-font-size `em` does not.
- **`px`** — borders, shadows, and pixel-precise details only.
- **`%` / `fr` / `vw` / `vh`** — responsive layout (grid tracks, viewport-sized
  regions like the lightbox `max-h-[85vh]`).
- **`clamp()`** — fluid text/sizing, with `rem` bounds and a `rem`+`vw` middle
  term (`clamp(1rem, 0.5rem + 1.5vw, 1.5rem)`) so it still responds to zoom.
- **unitless** — `line-height` (a ratio, not a length). Tailwind's
  `leading-none`/`leading-normal` already are.
- Prefer **tokens/variables** (Tailwind's scale, or `@theme` custom props such as
  `--font-sans` and `--duration-*`) over hardcoded values — but don't invent a
  token for a genuine one-off; a single literal is clearer inline.
- Don't use the 62.5% root font-size hack.

Note: page-title headings deliberately step at the `sm` breakpoint
(`text-3xl sm:text-4xl`) rather than using `clamp()` — the fluid range is narrow
and the semantic utility is more readable. `clamp()` is the tool if a genuinely
large display type is introduced later.

### Typography plugin for Markdown bodies — [Implicit]

`@tailwindcss/typography` (`prose` classes) styles rendered Markdown bodies —
project text blocks and the home page's About text. Because those bodies are
bilingual they live in frontmatter fields (`body_cs`/`body_en`), not the file's
Markdown body, so they're rendered from their Markdown strings with `marked` (a
tiny build-time dependency) inside `Prose.astro` rather than via Astro's
`render()`. See "Internationalization" below.

### Prose uses language-aware automatic hyphenation — [Explicit]

The shared `.prose` rule applies `text-align: justify` and `hyphens: auto` to
every Markdown body. `Prose.astro` emits separate `lang="cs"` and `lang="en"`
wrappers, so the browser selects its Czech or English hyphenation dictionary
rather than breaking both language variants by one generic rule.

### Self-hosted webfonts via @fontsource — [Implicit]

Roboto ships as a variable webfont from `@fontsource-variable/roboto`, imported in
`Base.astro` and bundled to `dist/_astro/*.woff2` — no third-party (Google Fonts)
request, which keeps with "fast and clean". It is the single page typeface:
`global.css`'s `@theme` sets one token, `--font-sans`, to Roboto, so body,
headings and nav all share it. There is deliberately **no** separate
display/heading token — Open Sans (body) and a `--font-display` seam were both
tried and removed in favour of one typeface everywhere (the owner's call: "if I
want separation later, I'll do it from scratch"). DIN Pro — also on the owner's
wishlist — is commercial with no free web licence and is omitted; to add it (or
any distinct heading face) later, self-host the licensed `woff2`, reintroduce a
`--font-display` token in `@theme`, and apply it to the headings/nav.

### Motion durations as `@theme` tokens — [Implicit]

The three transition speeds used by the CSS animations (reveal-on-scroll and the
theme-icon cross-fade) live as `--duration-fast/base/slow` tokens in `@theme`
rather than as inline seconds, so the values stay consistent and adjustable in
one place. The reveal offset is authored in `rem` (`translateY(0.875rem)`), not
`px`, so it scales with the root font size like the rest of the spacing.

### Dark mode: palette remap via CSS variables — [Implicit]

Dark mode is not a second set of utility classes; it's a remap of the palette
**tokens**. Tailwind v4 compiles colour utilities to `var(--color-*)` (e.g.
`bg-white` → `background-color: var(--color-white)`), so overriding those tokens
under `html[data-theme="dark"]` in `global.css` flips every existing
`bg-white`/`text-black`/`text-neutral-*` at once — no `dark:` class on any
component. `--color-white`/`--color-black` become charcoal/off-white and the
used neutral shades provide the intermediate contrast. The lightbox establishes
local literal black/white tokens because its dark inspection surface is the same
in both themes. This is why the old
`filter: invert` approach was rejected: a filter
also inverts `<img>` content, whereas a token remap leaves imagery alone. The one
exception that needs a `dark:` variant is the typography plugin, whose prose
colours are literal, not token-based — a registered `@custom-variant dark` plus
`dark:prose-invert` on the two `.prose` blocks handles the Markdown bodies.

The theme is selected before first paint by a tiny inline script in `Base.astro`.
An explicit `localStorage.theme` wins; otherwise `prefers-color-scheme` supplies
the initial theme and a media-query listener tracks live browser or system
changes. The footer button toggles `html[data-theme]` and persists that choice,
which stops the listener from overriding it. `<html>` ships `data-theme="light"`
so no-JS still falls back to light. The toggle shows the mode it switches _to_
(moon in light, sun in dark); the two icons are cross-faded purely in CSS off
`html[data-theme]`.

---

## Content

### Astro Content Collections + glob loader — [Implicit]

`src/content.config.ts` defines a `projects` collection loaded from
`src/content/projects/*.md`, with a Zod schema validating frontmatter. The
singletons — Site settings, Home, and Contact — are single Markdown files under
`src/content/singletons/`, imported directly where they're needed (`home.md`
supplies the home page's bio + portrait + gallery + approaches in
`index.astro`/`Carousel`/`Approaches`; `contact.md` in `contact.astro` and the
footer; `site.md` in the layout/nav). They are not collections (each is a one-off)
and are validated only through `.pages.yml` + their consuming code, not Zod.
Components guard optional fields where their content model permits them (e.g. an
empty approach list hides the section). Project frontmatter
stores an ordered discriminated block list: bilingual text, thumbnail gallery,
or full-width image set. All human-readable text is bilingual (paired
`_cs`/`_en` fields); the Markdown file *bodies* are unused — even the bio and
project text blocks live in `body_cs`/`body_en` frontmatter.

### Images: original uploads plus responsive display derivatives — [Explicit]

Images live in `public/uploads` and are referenced by root-absolute string paths
(e.g. `/uploads/cover.jpg`). This keeps the CMS flow direct: the CMS commits a
file and writes a path, with no import resolution involved.

Before development or production builds, `scripts/generate-responsive-images.ts`
finds raster uploads referenced by content and creates gamma-aware Lanczos
resizes as WebP files in the ignored `public/_responsive` directory. Derivatives
are auto-oriented, converted to the web sRGB colour space, and stripped of
metadata. PNG and alpha-bearing sources remain lossless; already-lossy sources
use high-quality lossy WebP. The original upload is never modified. The pipeline
probes each source first, generates widths up to and including its
orientation-aware native width, and publishes a full-image derivative only when
its file is smaller than the original. A generated manifest records the
dimensions, byte size, format, and content-addressed URL of every available
representation.

Reduced display surfaces build `srcset` from that manifest and provide accurate
`sizes` hints, avoiding severe browser downsampling of detailed architectural
linework without assuming every configured size exists. Every `object-cover`
surface uses `coverSizes` to multiply its slot-width hint when the source is
wider than the frame, because those images scale by height before their sides
are cropped. The hint also includes any hover enlargement. Width-constrained
sources keep the normal slot-size hint. The untouched original is replaced as
the terminal browser candidate by a smaller processed native-resolution
derivative whenever one is available. It remains the terminal candidate only
when processing cannot reduce its byte size. SVGs bypass the
derivative pipeline. A direct original-image link remains available independently
of browser display selection.

### Large gallery images use cached Deep Zoom pyramids — [Explicit]

Referenced rasters whose longest oriented side exceeds 4096 px receive a DZI
pyramid of 512 px WebP tiles. Each level is resized directly from the original
with the same gamma-aware Lanczos3 filter as a full-image derivative; levels are
not recursively block-shrunk. Lossless tiles have one pixel of overlap. Lossy
tiles have 16 px—one WebP macroblock—so codec-edge filtering remains outside
the visible tile core. This boundary avoids decoding full bitmaps above roughly
64 MiB of RGBA memory while leaving smaller images on the lower-overhead
full-image path. OpenSeadragon is dynamically imported only when such an image
opens. It requests the resolution levels and visible regions needed for the
current viewport and stops at a 1:1 ratio with the finest source level. Smaller
images select the least full-image derivative that covers their rendered pixels
and use the same native-detail zoom limit. Both calculations consume Svelte's
reactive device-pixel ratio, keeping them synchronized with browser-reported
density changes.

Pyramids use the same lossless-versus-photographic WebP policy as full-image
derivatives and have their own content-addressed cache keys. Their combined
files can exceed the original because they contain multiple resolution levels;
the benefit is bounded browser memory and network transfer for the region being
viewed, not a smaller aggregate deployment.

### Image derivatives use a content-addressed build cache — [Explicit]

Encoding results are cached under `node_modules/.astro/images` by SHA-256 keys
derived from the original bytes and the complete transformation recipe,
including the Sharp and libvips versions. A changed upload or recipe gets a new
cache entry; unrelated site changes reuse existing entries. Each build clears
and rematerializes `public/_responsive` from the cache so removed content is not
deployed. Public derivative URLs contain the cache key, so a changed source or
recipe cannot reuse a stale browser response. The test job and official Astro
GitHub Action persist `node_modules/.astro` under matching keys, sharing the
browser-test prebuild's results with the deployment build and later runs. A
missing or evicted cache remains safe because the same build recreates it from
the originals.

The manifest separates each upload's `originalUrl` from the `source.url` used as
the responsive ladder's lossless fallback. They normally match. When an encoded
path contains `%2B`, the generator copies the untouched bytes to a hash-only
`source.<ext>` URL and uses that for display because Astro's static preview
misresolves plus signs during file lookup. The lightbox's **Open original** link
continues to use `originalUrl`, so filename safety does not replace or re-encode
the architect's file.

### Project image-block items are caption records — [Explicit]

Each gallery or image-set item groups its root-absolute `image` path with optional
paired `title_cs`/`title_en` and `description_cs`/`description_en` fields, plus an
optional language-neutral `comparison_set` identifier. Keeping that metadata
beside its image preserves the associations when items are reordered in Pages
CMS. Both block types use the same record shape so the page-level lightbox can
flatten them into one sequence. After exact-path deduplication, the final
occurrence supplies both the caption and comparison membership.

### Sitemap — [Implicit]

`@astrojs/sitemap` generates `sitemap-index.xml` at build. Needs `site` (in
`astro.config.mjs`) set to the canonical origin to produce absolute URLs.

---

## Internationalization

### Both languages ship in one page, CSS picks which shows — [Explicit] (shape [Implicit])

The site is bilingual (Czech + English) but stays a **single set of URLs** — no
`/cs` or `/en` route prefixes. This was a deliberate choice to preserve the
root-only hosting model (see "Hosting") and to make "default to the visitor's
browser language" work on a static host with **no server** to negotiate
`Accept-Language`. Both language variants are rendered into every page; a CSS rule
keyed off `html[data-lang]` hides the inactive one:

```css
html[data-lang="cs"] [lang="en"] { display: none !important; }
html[data-lang="en"] [lang="cs"] { display: none !important; }
```

Consequences of this shape:

- **Language switching is instant** (no navigation) — the toggle just flips
  `html[data-lang]`; the other language is already in the DOM.
- **Both languages are in the HTML**, so search engines see both. There are no
  per-language URLs to share except the `?lang=` query (which the picker script
  honours), and no `hreflang` (there are no alternate URLs to point at).
- `<html>` is served with `data-lang="en"`, so if JS never runs the page falls
  back to **English** (a clean single language) rather than a blank page. The
  inline picker script overrides this before first paint when JS is on.

### Picking the language — a tiny inline script — [Implicit]

An `is:inline` script in `<head>` (so it runs before first paint, no flash) sets
`html[data-lang]` from, in order: `?lang=`, `localStorage`, `navigator.language`,
else English. A second module script in `Base.astro` wires the footer language
toggle (shows the other language, persists to `localStorage`, flips `data-lang`),
and syncs `<title>`/meta description to the active language. Each normally
loaded document reads the persisted language before first paint. No island —
same "tiny vanilla script" approach as reveal/carousel.

### Where the strings come from — `i18n.ts`, `T.astro`, `Prose.astro` — [Implicit]

- **Baked-in UI labels** (nav, section headings) live in `src/i18n.ts` as a
  `{ cs, en }` dictionary.
- **`T.astro`** renders a bilingual inline/block element — either a dictionary key
  (`<T k="about" />`) or explicit `cs`/`en` strings for CMS content — emitting one
  element per language with a `lang` attribute for the CSS rule to target.
- **`Prose.astro`** does the same for rich-text bodies, rendering each language's
  Markdown string with `marked`.

### Content shape: paired `_cs`/`_en` fields — [Implicit]

Translatable fields are declared as pairs (`title_cs`/`title_en`,
`body_cs`/`body_en`, `label_cs`/`label_en`, `day_cs`/`day_en`, …); genuinely
language-neutral fields (images, `year`, `email`, `phone`) stay single. This keeps
one file per project/singleton (rather than a file per language) and keeps the CMS
a single form. The `projects` Zod schema and `.pages.yml` both encode the pairs and
must stay in sync (see below). Sorting uses the English title for stability. The
project route uses Astro's filename-derived content ID. Pages CMS initially
generates the filename from the English title and exposes the complete filename
for later edits; renaming it therefore changes the route without another source
of truth for the slug.

---

## Content management

### CMS: Pages CMS (hosted) — [Explicit]

The user chose Pages CMS. Schema lives in `.pages.yml` at the repo root; the
editor is hosted at app.pagescms.org, so there is **no** OAuth proxy or server to
operate.

> History: Agent first proposed Sveltia CMS (which would have required a self-
> hosted OAuth proxy). After the user asked why the proxy was necessary and
> whether it could be avoided, the project switched to Pages CMS. The proxy
> requirement is a property of doing GitHub OAuth from a static host, not of any
> one CMS.

### Two sources of truth for content shape — [Implicit] (constraint to respect)

The frontmatter schema is declared **twice**: in `src/content.config.ts` (build-
time validation) and in `.pages.yml` (the editing UI). They must be kept in sync
by hand — see MAINTAINERS.md and AGENTS.md. This applies to the `projects`
collection. The singletons (Site, Home, Contact) have no Zod mirror — they are
declared only in `.pages.yml` and read straight from their Markdown — so for those
the pair to keep in sync is `.pages.yml` and the consuming component. Pages CMS
treats fields as optional unless `required: true` is explicit, so
`src/content.config.test.ts` checks that every field required by the Astro project
schema is also required in the editor.

### Empty project block lists — [Explicit]

Projects may have no content blocks. Pages CMS can serialize a blank row in an
optional block or nested image list as `{}`, so the Astro schema removes
completely empty rows before validating the remaining items. Text blocks require
both languages, and gallery/image-set blocks require at least one valid image.

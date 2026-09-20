# Features

Why the site behaves the way it does — the _product_ decisions. For _technical_
decisions (why the code is shaped this way) see [ARCHITECTURE.md](ARCHITECTURE.md).

Each decision is tagged:

- **[Explicit]** — the user asked for this by name, or chose it when offered.
- **[Implicit]** — Agent proposed it and the user did not push back.

---

## Purpose & feel

### An architect's portfolio — [Explicit]

The site exists to showcase an architect's built work. Every other decision
serves that: large imagery, quiet typography, minimal chrome.

### Fast and clean — [Explicit]

The user's headline requirement. Concretely: static pages, near-zero JavaScript,
lazy-loaded images, no bloat. Performance is a feature, not an afterthought.

### Minimal, image-forward visual design — [Implicit]

Generous whitespace, work shown in a simple grid, a strict black-and-white palette
(see below). Agent chose this direction; the user did not specify an aesthetic
beyond "clean". The site
belongs to Ing. arch. Tereza Kalábková; the full name and credential are the nav
wordmark — the name is set uppercase ("Ing. arch. TEREZA KALÁBKOVÁ") while the
"Ing. arch." credential stays normal case so it reads cleanly — and also appear in
the About bio and SEO description. Clicking the wordmark is how you get home
(there is no Home menu item).

### Works on phones — [Implicit]

The layout is responsive down to small phones. Concretely: the nav wordmark
stacks the credential above the name on narrow screens (and drops to a smaller
size with tighter letter-spacing) so it never crowds or overflows past the
WORK/CONTACT links; the work grid steps 3 → 2 → 1 columns with gaps that shrink
on smaller viewports (the airy desktop gutter would be too wide for a phone);
section vertical padding tightens on small screens so there's less empty
scrolling; and tap targets (nav links and footer controls) get more
height on touch-sized screens. Everything sizes from one shared content width
(`max-w-6xl`) with `px` gutters, so pages line up at every breakpoint.

### Black-and-white visual language — [Explicit]

White background, black text throughout; greys are allowed for secondary text
(dates, locations, captions). Any colour comes from the project imagery and the
architect's drawings, never from the UI chrome. This follows the design brief
and the near-monochrome reference sites cited there (maaus.cz,
storyarchitekti.cz).

### Nav links have three states — [Explicit]

The menu is just **Work** and **Contact** — there is no "Home" link, because the
home page is reached by clicking the name wordmark. Each link has three states:

- **Idle:** plain text, no highlight.
- **Hover:** a black square (outline box) around the link.
- **Current page / clicked:** inverted — white text in a solid black box.

Menu labels are set uppercase with wide tracking. (This supersedes the
underline-based affordance in the original brief; the architect revised it to the
none → box → invert scheme.)

This is the site's shared interaction vocabulary — **outline box on hover,
inverted (solid black) on press/selected** — and it is reused for other controls,
notably the carousel arrows and dots, so interaction feels consistent everywhere.
Plain text links (email, phone, footer) keep a simple underline instead, which
reads better inline than a box.

### Typeface: Roboto throughout — [Explicit]

The whole page is set in Roboto — the same font as the nav's WORK/CONTACT links —
at the architect's request. Open Sans and DIN Pro were also listed as preferred
fonts; Open Sans was the body font at first but was dropped when one typeface was
requested everywhere, and DIN Pro is commercial with no free web licence, so it
is not used (see ARCHITECTURE.md → "Self-hosted webfonts").

---

## Content & maintenance

### The architect maintains content themselves — [Explicit]

A non-technical person must be able to add/edit projects without touching code,
Git, or Markdown. This is the core reason a CMS exists in the project at all.

### Most page content is editable in the CMS — [Explicit]

The architect asked for as much of the site as possible to be editable in Pages
CMS, with only the general scaffolding baked into code. Editable: projects, the
home page (bio, portrait, carousel images, Approach items), the contact details,
and a small set of Site settings (name, credential, SEO text) — the text among
these is entered in **both languages** (see "Dual language" below). Baked in: page
structure, navigation, and section labels ("Work", "About", "Approach",
"Contact"), which are translated in code. The CMS entries mirror the pages —
**Home**, **Projects**, **Contact**, and global **Site settings** — each backed by
a file under `src/content/singletons/` (or the `projects` collection).

### Larger changes are made by the developer — [Explicit]

Structural/design changes are done in code by the developer, on the same repo.
Content edits and code edits share one source of truth and don't conflict.

### Browser-based editing via Pages CMS — [Explicit]

The architect edits at app.pagescms.org: friendly forms, drag-and-drop image
upload, no server to run. Saving commits to `master` and the site redeploys.

### Projects have title, year, and optional location — [Implicit]

The fields exposed for each project. `location` is optional; `title` and `year`
are required.

### Incomplete projects cannot be saved — [Explicit]

Pages CMS validates the same required project fields as the production build:
both titles, year, cover image, and both descriptions. It blocks the save in the
editor instead of committing content that would fail the deployment pipeline.
The gallery and both locations remain optional.

### Project URLs use an editable filename — [Explicit]

Pages CMS shows the complete Markdown filename when creating and editing a
project. The name before `.md` supplies the public URL segment, so renaming the
file also changes the project URL and breaks old links and bookmarks.

### Editable site settings — [Explicit]

A small "Site settings" CMS entry holds the owner's name, credential (e.g. "Ing.
arch."), and the SEO description (in both languages). These feed the nav wordmark,
the footer copyright, and the default meta description, so they are changed in one
place rather than being scattered through the code.

### Draft flag to hide unfinished projects — [Implicit]

A project marked `draft: true` is excluded from the site. Lets the architect
stage work before publishing.

### Projects sort newest-first, then alphabetically — [Explicit]

Projects on the Work page sort by `year` descending (newest first), then by
title A–Z as a tie-breaker within the same year — using the **English** title so
the order is stable no matter which language the visitor is viewing. This is fully
automatic — there is no manual "sort order" field to maintain (an earlier `order`
number existed but was dropped when the architect asked for this
year-then-alphabetical rule).

### The home page is the About page — [Explicit]

The root URL (`/`) follows the architect's wireframe: a gallery at the top, an
About section under it (bio on the left, portrait on the right), then the Approach
section — all aligned to one content width. The whole home page — carousel images,
bio, portrait, and approach — is edited from a single **Home** CMS entry
(`home.md`); there is no separate "About page" entry, since About is a section of
Home, not its own page.

### Home-page image carousel — [Explicit]

The home page opens with a big image carousel — one image at a time, with
prev/next arrows and dot indicators, matching the architect's wireframe. It also
auto-advances (every 5s), pausing when the visitor hovers or focuses it, and does
not auto-advance for visitors who prefer reduced motion. Preference changes take
effect without reloading the page. Its arrow controls use the same size, symbols,
and hover/press treatment as the project lightbox, while its native scrolling,
cropped presentation, dots, and autoplay remain specific to the home page.
Controls drawn over an image keep a theme-independent high-contrast palette;
changing the page theme never turns the carousel dots into dark page chrome. The
images can be curated in the CMS (the Home entry's gallery); when that list is
left empty it falls back to every project's cover + gallery photos, so it stays
current with no maintenance — [Implicit].

### Work page lists the projects — [Explicit]

Projects live on their own `/work` page, separate from the About home page. The
layout is a **three-column** grid of **square** cover images, each with its title
(and year/location) underneath. Hovering a card **enlarges the whole image** a
little — the entire tile scales up, rather than the old zoom-within-a-fixed-frame.
On narrower screens the grid steps down to two columns, then one — [Implicit].

### "Approach" section on the home page — [Explicit]

A section below the bio describing how the architect works, as a **vertical**
stack of items (Place, Scale, Material, Thinking); each item's icon enlarges on
hover. The architect requested this space and preferred it laid out vertically
rather than as the horizontal row on the reference site (maaus.cz), and without
dividing lines between items. The items (label, text, and which of four line
icons) are editable in the CMS (the Home entry) and can be added, removed, or
reordered; the text ships as placeholder wording. The icon set
(place/scale/material/thinking) is fixed in code — [Implicit].

---

## Language

### Dual language, Czech + English — [Explicit]

The whole site is bilingual. Every visible piece of text exists in both Czech and
English: the baked-in labels (nav, section headings, screen-reader controls) and
all CMS content (projects, bio, approach, contact, SEO). The architect provides
both languages for all editable content. Project cover images are decorative to
assistive technology because their adjacent bilingual project title already
names the card or page.

### Manual switch, defaults to the visitor's browser — [Explicit]

On first visit the language is chosen automatically — a `?lang=cs`/`?lang=en` in
the URL wins, then the visitor's previously saved choice, then their **browser
language**, falling back to **English** if that's neither Czech nor English. A
single language button lets them switch manually at any time; it shows the
language it will switch _to_ (`CZ` while viewing English, `EN` while viewing
Czech), and the choice is remembered for next time. The toggle lives in the
**footer** (not the nav — the architect found it confusing there, and since the
site already auto-detects language it's a fallback control, not a primary one).

Switching is instant — no page reload — because both languages are already in the
page and the switch just flips which one is shown. A specific language can also be
linked directly with `?lang=en`, which is handy for sharing.

---

## Interactivity & motion

### Some interactivity and smoothness — [Explicit]

The user wanted the site to feel alive and smooth.

### No heavy animation, no scroll hijacking — [Explicit]

An explicit boundary: the user finds reimplemented/hijacked scrolling annoying.
Motion must ride the native scrollbar and stay subtle.

### Smooth page-to-page transitions — [Implicit]

In browsers with cross-document View Transitions, navigating between pages
crossfades instead of a hard reload. Project covers move between the work grid
and their project page, progressively changing crop between the square card and
the full image, including on the first uncached visit. Other browsers use normal
page navigation. Hover enlargement remains independent of the moving cover.
Work cards skip the general fade-in-on-scroll effect so entering the Work page
has one transition. Delivers "smoothness" without a heavy SPA.

### Fade-in-on-scroll — [Implicit]

Content eases in as it scrolls into view, using the real scrollbar (no
hijacking). Honors the explicit motion boundary.

### Dark mode — [Explicit]

The architect's brief floated inverting the page to white-on-black ("after
clicking — the opposite"). It now ships as a proper dark mode: a charcoal
background, softened off-white text, and matching greys replace the harsher pure
black/white inversion, while **photos and drawings are left untouched** (an
image-forward site must never invert its imagery). With no saved choice, the page
follows the visitor's browser or system preference and responds when it changes.
A **single toggle in the footer**, next to the language switch, flips the theme
and becomes an explicit override; it shows the mode it will switch _to_ — a moon
in light mode, a sun in dark mode — cross-fading as it flips. The choice is
remembered for next time and carries across page navigations. Both footer toggles
use the same square hit area. (An earlier attempt using a CSS
`filter` invert was dropped because it inverted the photos too and fought the
sticky nav and View Transitions.)

### Image lightbox / gallery — [Implicit]

Project images open in a viewport-filling, keyboard-navigable lightbox (arrows,
Esc). The selected thumbnail expands into the lightbox image and returns to its
grid position on close, changing crop as its aspect ratio changes and waiting
for the enlarged preview before it animates. The overlay fades over the page and
its header; the header remains in place beneath it. Thumbnail hover remains
independent, including when the lightbox opens partway through the hover effect.
The lightbox shows the current image and total count, and its navigation controls
use the same visual language as the home carousel without adopting autoplay,
cropping, or dot indicators.
If the sticky header or viewport edge obscures a thumbnail, the lightbox uses
only the overlay fade instead of lifting the hidden part into an image morph.
Image gestures and page scrolling wait for opening and closing transitions to
finish. Closing a zoomed image fades the overlay without morphing the manipulated
image into its thumbnail. Zoomed content stays inside its outgoing slide when
moving to another image.

### Addressable lightbox images — [Explicit]

Each open image has a position-based `#image-N` URL that can be copied or opened
directly. Moving between images updates that address without adding more history
steps: Back closes the lightbox in one step, and Forward reopens its last image.
A directly loaded image link also closes to its project page before Back leaves
the page.

### Accessible lightbox modal — [Explicit]

Opening the lightbox moves keyboard focus to its controls and keeps focus inside
until it closes. Closing it restores focus to the thumbnail that opened it
without moving the page.
The overlay contains wheel, touch, and keyboard scrolling, while deliberate
scrollbar movement is left in place when the lightbox closes. Its dialog,
thumbnail, close, and navigation labels follow the selected site language. The
top controls and navigation buttons stay outside the image viewport, including
while zoomed.

### High-detail architectural images — [Explicit]

Reduced views such as project cards, the home carousel, and gallery thumbnails
use prefiltered responsive images instead of asking the browser to shrink the
full multi-megapixel drawing in one step. This reduces resampling aliasing in
fine plans and linework, including during thumbnail hover effects. The project
gallery requests extra source width for landscape images cropped into square
thumbnails, preventing those previews from being enlarged. The project lightbox
starts with a representation suited to its on-screen size and display density,
updates that representation when browser zoom or screen density changes, and
loads more detail as the visitor zooms. Drawings larger than 4096 px use 512 px
deep-zoom tiles over a density-matched processed preview, so the
browser requests only useful resolution levels and visible regions without
showing dark gaps between arriving tiles or decoding the entire print-sized
image. Reopening a tiled image after changing browser zoom refreshes its canvas
at the new display density. Smaller images progress through processed full-image
variants. Both paths stop at native image detail. The untouched original is not
displayed automatically; it can be opened directly from the lightbox. The
pipeline never enlarges an upload, and a processed full-image candidate is
published only when it is smaller than the original.
Transparent and PNG previews preserve lossless detail, while photographic
previews use conservative high-quality compression. Camera orientation and web
colour are normalized in previews without changing the uploaded original.
Every tiled resolution level uses the same line-preserving Lanczos resampling
as a full-image preview. Tile overlaps keep sampling and lossy-compression edges
outside the visible tile boundaries.

### Lightbox inspection controls — [Explicit]

Desktop visitors can zoom toward the pointer with the mouse wheel and drag a
zoomed image to inspect it. The current zoom percentage is always visible and
clicking it resets zoom and pan to 100%. On desktop the image stays between the
navigation controls; on mobile those controls sit in their own row below it.
Touch visitors can pinch around the point between their fingers and drag a
zoomed image with one finger. At 100%, horizontal dragging with either a finger
or mouse navigates between gallery images; completed navigation slides to the
next image and an incomplete gesture snaps back.
Buttons and arrow keys use the same short slide. With reduced motion, swipes
remain stationary and a completed gesture changes the image immediately.
Previous, current, and next images form a continuous strip, so one
image enters directly as the other leaves without exposing the dark background.
Maximum zoom depends on the image and display density, ending when native image
pixels reach display pixels. A bilingual control opens the untouched original
in a separate browser tab.

Tiled and full-image previews use the same immediate gesture response. Zoomed
inspection has no momentum or settling animation; at 100%, both previews move
only with a live navigation gesture and then slide onward or snap back. Pyramid
previews request the first resolution level at or above the display's
physical-pixel requirement so their base view is not an upscaled lower level.

### Optional image titles and descriptions — [Explicit]

Each project gallery image can have a short title and description in Czech and
English. Both fields are optional and appear only beneath the enlarged image in
the lightbox, keeping the thumbnail grid image-only. The caption occupies a
fixed rail so switching between captioned and uncaptioned images does not resize
the image viewport. It is left-aligned to the image and uses its available
width; unusually long text scrolls within that rail. The caption slides with
its image during navigation, but dragging or swiping the text never changes the
image.

### Project galleries are optional — [Explicit]

A project can have no gallery images. A gallery entry that contains caption
content must have an image.

### Respects reduced-motion preferences — [Implicit]

Users who set `prefers-reduced-motion` get no fade/transform animation. Changes
to that preference apply immediately. Lightbox open/close transitions and live
swipe movement are also disabled.

---

## Reach

### Served from a custom domain at the root — [Explicit]

The site is served from the architect's own custom domain at the root URL. The
user initially wanted the GitHub Pages project URL to work too, but later gave
up dual-URL support in favour of a single root deployment — the simpler setup.
See ARCHITECTURE.md → "Hosting: custom domain at the root". (Once the domain is
configured, GitHub still 301-redirects the `*.github.io/<repo>/` URL to it.)

### Basic SEO & sharing — [Implicit]

Per-page title/description, Open Graph tags, and a generated sitemap so pages
index and share cleanly.

### Contact page — email, phone, and availability — [Explicit]

A dedicated `/contact` page (same content width as the rest of the site, laid out
in two columns like the About section) shows the email (mailto) and phone (tel
link), plus a **per-day availability schedule** under the heading "When to reach
me" — framed as likely-to-answer times, not formal "opening hours", with one row
per day (hours, or "—" when unavailable). The email also appears in
the global footer. All of it — email, phone, and the day-by-day availability — is
editable in the CMS (the Contact entry). No contact form (no backend to process
one, and it keeps things simple).

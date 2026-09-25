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
(`max-w-6xl`) with `px` gutters, so pages line up at every breakpoint. Off-screen
carousel slides remain inside their horizontal scroller and never widen the page.

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

### Justified, language-aware prose — [Explicit]

Rich-text bodies and lightbox image descriptions are justified and use
automatic hyphenation. Each Czech and English variant keeps its own `lang`
attribute, allowing the browser to apply the corresponding language's
word-breaking and hyphenation rules. Short interface labels, metadata, and image
titles remain normally aligned.

---

## Content & maintenance

### The architect maintains content themselves — [Explicit]

A non-technical person must be able to add/edit projects without touching code,
Git, or Markdown. This is the core reason a CMS exists in the project at all.

### Most page content is editable in the CMS — [Explicit]

The architect asked for as much of the site as possible to be editable in Pages
CMS, with only the general scaffolding baked into code. Editable: projects, the
home page (bio, portrait, homepage images, Approach items), the contact details,
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
both titles, year, and cover image. It blocks the save in the editor instead of
committing content that would fail the deployment pipeline. Page blocks and both
locations remain optional; text blocks require both language versions, and image
blocks require at least one image.

### Project URLs use an editable filename — [Explicit]

Pages CMS shows the complete Markdown filename when creating and editing a
project. The name before `.md` supplies the public URL segment, so renaming the
file also changes the project URL and breaks old links and bookmarks.

### Editable site settings — [Explicit]

A small "Site settings" CMS entry holds the owner's name, credential (e.g. "Ing.
arch."), and the SEO description (in both languages). These feed the nav wordmark,
the footer copyright, the browser tab titles, and the default meta description,
so they are changed in one place rather than being scattered through the code.

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
section — all aligned to one content width. The whole home page — homepage images,
bio, portrait, and approach — is edited from a single **Home** CMS entry
(`home.md`); there is no separate "About page" entry, since About is a section of
Home, not its own page.

### Home-page image or carousel — [Explicit]

The architect explicitly selects and orders at least one homepage image in the
Home CMS entry; project images are never added automatically. One selected image
is displayed directly at its natural aspect ratio. Two or more form a carousel
with prev/next arrows and dot indicators, matching the architect's wireframe. It
auto-advances (every 5s), pausing when the visitor hovers or focuses it, and does
not auto-advance for visitors who prefer reduced motion. Preference changes take
effect without reloading the page. Its arrow controls use the same size, symbols,
and hover/press treatment as the project lightbox, while its native scrolling,
cropped presentation, dots, and autoplay remain specific to the multi-image case.
Controls drawn over an image keep a theme-independent high-contrast palette;
changing the page theme never turns the carousel dots into dark page chrome. The
selection itself is maintained in the Home CMS entry.

### Work page lists the projects — [Explicit]

Projects live on their own `/work` page, separate from the About home page. The
layout is a **three-column** grid of **square** cover images, each with its title
(and year/location) underneath. Hovering a card **enlarges the whole image** a
little — the entire tile scales up, rather than the old zoom-within-a-fixed-frame.
On narrower screens the grid steps down to two columns, then one — [Implicit].

### "Approach" section on the home page — [Explicit]

A section below the bio describing how the architect works, as a **vertical**
stack of items (Place, Scale, Material, Thinking); each item's icon enlarges from
its centre on hover — [Explicit]. The architect requested this space and
preferred it laid out vertically rather than as the horizontal row on the
reference site (maaus.cz), and without dividing lines between items. The items (label, text, and which of four line
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
the full image, including on the first uncached visit. Like the lightbox, the
moving cover is a single full image cropped by its changing frame rather than a
blend of the two crops, and it starts from the card's hover zoom — [Explicit].
Other browsers use normal page navigation. Hover enlargement remains independent
of the moving cover.
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

### Ordered project-page blocks — [Explicit]

A project page is assembled from an ordered list of independent text, thumbnail
gallery, and full-width image-set blocks. Text blocks carry required Czech and
English rich text. They use a narrower single-column reading width below 1024
px, then fill the project frame as two columns on wider screens. The cover,
gallery blocks, and image sets use the full frame so project imagery aligns with
the rest of the site. Gallery blocks display square thumbnails. An image set
spans the project content width: one item is a standalone image, while multiple
items form a manually controlled scroll-snap carousel with arrows and dots.
Blocks can be reordered and repeated freely, so a full-width drawing can sit
between two galleries without belonging to either one.

### Image lightbox / gallery — [Explicit]

The cover and every image in every project block belong to one page-level,
viewport-filling, keyboard-navigable lightbox (arrows, Esc), ordered as they
appear on the page. Clicking any of those images opens its position in that
sequence. The selected image expands into the lightbox and returns to its page
position on close, changing crop as its aspect ratio changes and waiting for the
enlarged preview before it animates. The overlay fades over the page and its
header; the header remains in place beneath it. Image hover remains independent,
including when the lightbox opens partway through the hover effect.
Every occurrence of an image is its own lightbox position with its own title and
description, including when the same upload is used more than once on a page —
[Explicit].
The lightbox shows the current image and total count, and its navigation controls
use the same visual language as the home carousel without adopting autoplay,
cropping, or dot indicators.

If the sticky header or viewport edge obscures a thumbnail, the lightbox uses
only the overlay fade instead of lifting the hidden part into an image morph.
Image gestures and page scrolling wait for opening and closing transitions to
finish. Closing a zoomed image fades the overlay without morphing the manipulated
image into its thumbnail. Zoomed content stays inside its outgoing slide when
moving to another image.

### Full-screen lightbox with controls in the corners — [Explicit]

The drawing owns the whole screen: the lightbox is 90% black, so the page shows
faintly around the card and behind the controls, it has no rows above or below
the image, and every control is a separate box floating over it. The set strip
sits top-left, × is always in the top-right corner, Previous/Next are centred on
the left and right edges, the description toggle sits bottom-left, and the
bottom-right corner holds a `[CZ]`/`[EN]` language switch and one `[3 / 17 ↗]`
link that shows the position and opens the untouched original in a new tab. All
controls are 40 px boxes with a solid black fill, the site's outline-on-hover
and invert-on-press treatment, and the current or pressed option inverted to
white. Every element that looks like a button is one. The language switch is the
same toggle as the footer's, so the page underneath changes with it; the
lightbox keeps its image, side, zoom, and pan.

At 100% the image fits between a top and a bottom control band, so nothing
covers it, and it may use the full width under the edge arrows (on a phone a
square drawing fills the width). The 100% view depends only on the image's
aspect ratio, never on its title or description, so swipes and blends between
variants keep their geometry. Zoomed, the image runs under the controls to the
screen edges, and any part of it can be panned out from under every control.
Zooming out below 100% is allowed until the image clears the edge arrows too.

### Addressable lightbox images — [Explicit]

Each open image has a position-based `#image-N` URL that can be copied or opened
directly. Moving between images updates that address without adding more history
steps: Back closes the lightbox in one step, and Forward reopens its last image.
A directly loaded image link also closes to its project page before Back leaves
the page.

### Accessible lightbox modal — [Explicit]

Opening the lightbox moves keyboard focus to its controls and keeps focus inside
until it closes. Closing it restores focus to the image trigger that opened it
without moving the page. While it animates open or closed it ignores input;
while opening it also reports itself busy to assistive technology — [Implicit].
Clicking the dark area around the image keeps the lightbox open; users close it
with the dedicated close control, Escape, or browser Back.
The overlay contains wheel, touch, and keyboard scrolling, while deliberate
scrollbar movement is left in place when the lightbox closes. Its dialog,
image, close, and navigation labels follow the selected site language. The
controls never move with the image while it is panned, zoomed, or swiped. Tab
cycles through every control and, while the description shows, its scrolling
text. A visually hidden live status announces the position after every change.

### High-detail architectural images — [Explicit]

Reduced views such as project cards, the home carousel, and gallery thumbnails
use prefiltered responsive images instead of asking the browser to shrink the
full multi-megapixel drawing in one step. This reduces resampling aliasing in
fine plans and linework, including during thumbnail hover effects. Every cropped
preview requests enough source width to fill its frame by height as well as
width, including any hover enlargement, preventing landscape images from being
upscaled after the browser selects a candidate. The project lightbox starts with
a representation suited to its on-screen size and display density, updates that
representation when browser zoom or screen density changes, and
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

Desktop visitors zoom toward the pointer with the mouse wheel and drag a zoomed
image to inspect it. Touch visitors pinch around the point between their fingers
and drag a zoomed image with one finger. At 100% and below, horizontal dragging
with either a finger or mouse navigates between page images; moving to another
card slides the strip with the finger, completed navigation slides on to the
next image, and an incomplete gesture snaps back. Moving to a variant of the
same card blends instead (see "Cards and their variants"). Buttons and arrow
keys use the same short slide or blend. With reduced motion, swipes remain
stationary and a completed gesture changes the image immediately. Previous,
current, and next images form a continuous strip, so one image enters directly
as the other leaves without exposing the dark background. Maximum zoom depends
on the image and display density, ending when native image pixels reach display
pixels.

Double-click or double-tap zooms in to 2.5× at that point (or to the maximum, if
lower) and returns to 100% when zoomed. On the drawing side `+`/`=` and `-` zoom
around the centre and `0` returns to 100% — [Implicit].

Tiled and full-image previews use the same immediate gesture response. Zoomed
inspection has no momentum or settling animation; at 100%, both previews move
only with a live navigation gesture and then slide onward or snap back. Pyramid
previews request the first resolution level at or above the display's
physical-pixel requirement so their base view is not an upscaled lower level.

### Cards and their variants: aligned-drawing comparison sets — [Explicit]

The architect can assign otherwise ordinary project images to a named comparison
set and give each image a Czech and English title. Set membership does not
change the project page: every preview remains an individual image in its
existing gallery or image-set position.

In the lightbox, changing image changes cards, and the images of one comparison
set are variants of one card. Previous/Next, the arrow keys, and swipes walk the
page order; when the neighbouring image belongs to the same set, the card blends
into it and keeps the zoom and pan, so aligned plans can be compared without
losing the inspected location. A neighbour outside the set is a different card:
it slides in and the view resets, even if another member of the set lies further
on.

Opening any member shows the whole set as the top-left set strip: one joined row
of named buttons, the current image inverted. A button changes to that variant
exactly as Previous/Next would, and may reach a member that is not a neighbour.
The strip stays one row at every viewport width, scrolls sideways when it does
not fit beside ×, and brings the current image into view. Touch dragging and a
mouse wheel over the strip both move it horizontally without scrolling the page.

At 100% and below, a horizontal drag towards a variant does not move the strip:
it scrubs the blend by exactly the share of the screen width a slide would have
moved, so dragging across the whole width shows the variant fully. Releasing
past the swipe threshold completes the blend; releasing short blends back.
Towards a different card the same drag moves the strip with the finger, and when
zoomed a drag pans. A drag still held when the image changes another way (a key
or a button) ends with that change. With reduced motion there is no scrub, and
the change happens at once on release or click.

The selected image continues to use the same responsive or tiled deep-zoom
renderer as every other lightbox image. A set's zoom limit is the lowest native
detail limit among its members, so every variant can display the retained view
without being enlarged past its available pixels.

### Optional image titles and descriptions — [Explicit]

Each project-block image can have a short title and description in Czech and
English. Both fields are optional and appear only in the lightbox, keeping page
imagery uncluttered. A titled image outside a comparison set shows its title as
a set strip of one; an image with neither title nor set shows no strip.

Each image in the lightbox is a card with its drawing on the front and, when it
has a description, the description on the back — [Explicit]. An icon-only toggle
button in the bottom-left corner, named "Show description" and pressed while the
text shows (text lines on the drawing side, an inverted picture on the text
side), turns the current card over with a short 3D flip about the card's own
vertical centre line. The back is a real card back — [Explicit]: in the
drawing's shape and the page's own colours, following the site theme like paper
(the light surface with dark text, or the dark surface with light text,
switching live) — [Explicit], and exactly the drawing's size at 100% when the
text fits there; a longer text grows the card, keeping its shape, just until the
title and the justified, hyphenated column fit comfortably at the normal text
size. The column keeps the project page's reading width, the card's padding
(which grows with the card) and the screen's limits: it stays centred on the
screen and clear of the side arrows, or of the page's side margins on phones,
even when a wide card reaches past the screen edges. Throughout a turn, even
from a zoomed or panned view and with a card larger than the screen, the two
faces share one outline, which only the screen's edges cut, so nothing of the
drawing shows while the back faces the viewer and nothing of the back while the
drawing does. The see-through backdrop shows around the card, and the backdrop
and controls stay black and white. On the text side the wheel scrolls the text
and zoom keys do nothing.

A card taller than the screen scrolls as a whole — [Explicit]: the text side is
an ordinary scrolling page with the browser's own scrollbar, wheel, touch and
keyboard scrolling, whose content is the card, so scrolling pans the card. It
opens with its top edge visible below the controls and the backdrop above it,
and ends with its bottom edge above the bottom controls; mid-way the card passes
under the controls. The scrollbar belongs to the back — [Implicit]: it shows
only while the back faces the viewer, never over the drawing.

The flip is zoom-aware — [Explicit]. Turning to the text from a zoomed or panned
drawing zooms and pans the card, in the same movement and timing as the turn, to
the whole card at the top of its text; turning back returns to exactly the view
the visitor left, zooming in as the card turns. The drawing's view is untouched
while the text shows, so reading never moves it; a resize re-fits the card,
keeps the reading position, and the drawing view returns within its new limits.

Changing image by any route shows the new image drawing side up. From the text
side, moving to a different card slides the card away still showing its text
while the next drawing slides in, and nothing rotates. Moving to a variant of
the same card (Previous/Next, the arrow keys, a swipe, or a set button) turns
the card back to its drawing side, zooming into the view the visitor left, while
both faces blend over the whole turn: the front from the current drawing to the
variant's, the back from the current text to the variant's text (or to nothing,
if the variant has none; a variant without responsive variants has no back to
blend in, so the current text stays until that variant is shown and its drawing
has loaded). Edge-on, both faces are exactly halfway, and the card ends on the
variant's drawing at that view, with the variant's text on its back. A sideways
drag on the text towards a variant drives the turn and the blend together from
one progress, so releasing short turns and blends back to the text. The language
switch keeps the current side. Dragging sideways over the text towards a
different card moves the strip with the finger exactly as over the drawing,
while a mostly vertical drag scrolls the text without moving the strip, text
selection stays native, and a drag never starts while text is selected. On
phones the edge arrows step aside while the text shows. Images without a
description have no toggle and no back. Closing while the text shows fades the
lightbox without morphing it into the thumbnail, and reopening shows the
drawing.

### Project page content is optional — [Explicit]

A project can contain only its required cover and no content blocks. Every image
block contains at least one image; an image record with a title or description
still requires its image.

### Respects reduced-motion preferences — [Implicit]

Users who set `prefers-reduced-motion` get no fade/transform animation. Changes
to that preference apply immediately. Lightbox open/close transitions, live
swipe movement, and blends between variants are also disabled (the change
happens at once), and turning over to an image description becomes a short
crossfade with the zoom changing at once.

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
Browser tab titles pair the page name with the credentialed owner name, separated
by `|` — for example "Work | Ing. arch. Tereza Kalábková", or "Ing. arch. Tereza
Kalábková | Architecture" on the home page — [Explicit].

### Contact page — email, phone, and availability — [Explicit]

A dedicated `/contact` page (same content width as the rest of the site, laid out
in two columns like the About section) shows the email (mailto) and phone (tel
link), plus a **per-day availability schedule** under the heading "When to reach
me" — framed as likely-to-answer times, not formal "opening hours", with one row
per day (hours, or "—" when unavailable). The email also appears in
the global footer. All of it — email, phone, and the day-by-day availability — is
editable in the CMS (the Contact entry). No contact form (no backend to process
one, and it keeps things simple).

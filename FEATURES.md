# Features

Why the site behaves the way it does — the _product_ decisions. For _technical_
decisions see [ARCHITECTURE.md](ARCHITECTURE.md).

- **[Explicit]** — the user asked for this by name, or chose it when offered.
- **[Implicit]** — Agent proposed it and the user did not push back.

---

## Purpose & feel

### An architect's portfolio — [Explicit]

Showcases the work of Ing. arch. Tereza Kalábková: large imagery, quiet
typography, minimal chrome.

### Fast and clean — [Explicit]

The headline requirement: static pages, near-zero JavaScript, lazy-loaded images.

### Minimal, image-forward design — [Implicit]

Generous whitespace and a simple grid. The nav wordmark is the credentialed name
("Ing. arch. TEREZA KALÁBKOVÁ", name uppercase, credential not) and is the way
home; there is no Home menu item.

### Works on phones — [Implicit]

Responsive down to small phones: the wordmark stacks, grids and gaps step down,
touch targets grow. Every page shares one content width, so pages line up at
every breakpoint.

### Black and white — [Explicit]

White background, black text, greys for secondary text. Colour comes only from
the imagery, never the UI, following the design brief.

### Nav and controls: idle, outline on hover, inverted when current — [Explicit]

The menu is just **Work** and **Contact**, uppercase with wide tracking. The
outline-then-invert treatment is the site's interaction vocabulary, reused by
carousel and lightbox controls. Inline text links keep an underline.

### Roboto throughout — [Explicit]

One typeface for the whole page, at the architect's request. DIN Pro, also on
her list, has no free web licence.

### Justified, hyphenated prose — [Explicit]

Rich-text bodies and image descriptions are justified with automatic
hyphenation in the right language's rules. Labels, metadata and titles are not.

---

## Content & maintenance

### The architect edits content in Pages CMS; the developer changes code — [Explicit]

She edits in the browser at app.pagescms.org with forms and image upload, no
code, Git or Markdown. Saving commits to `master` and the site redeploys.
Structural and design changes are made in code on the same repo.

### Most of the site is editable — [Explicit]

Editable: projects, the home page (images, bio, portrait, Approach), contact
details and Site settings (name, credential, SEO description). Baked into code:
page structure, navigation and section labels. CMS entries mirror the pages:
**Home page**, **Projects**, **Contact**, **Site settings**.

### Required fields are what a page cannot do without — [Implicit]

The name, the contact email, both About texts, at least one home image and every
field of an Approach item or availability row are required; everything else may
be empty. An edit
that would leave a page unrenderable fails the build and does not deploy.

### Projects: title and year; everything else optional — [Explicit]

The CMS refuses to save a project without both titles and a year. The brief and
the content blocks are optional; so is the location — [Implicit]. A text block
needs both languages, an image block at least one image.

### Brief — [Explicit]

A project may have a short plain-text brief in both languages, with the author's
line breaks kept. On the project page it sits under the title and location, above
the content blocks — [Implicit].

### A project without content blocks has no page — [Explicit]

It is a brief entry: it appears only in the work page's list. A project with text
blocks but no images has a page, with no lightbox — [Implicit].

### The cover is the first image in the project — [Explicit]

There is no separate cover field: a project's cover is its first image in page
order, across gallery and full-width image-set blocks. The project page is the
header and then the blocks in the architect's order, the first block under the
same gap whatever its type, and its first image loads eagerly — [Implicit].

### Project URL is the editable filename — [Explicit]

The filename before `.md` is the URL segment, so renaming a project breaks old
links.

### Editable site settings — [Explicit]

Name, credential and SEO description in one CMS entry, feeding the wordmark,
footer, tab titles and meta description.

### Draft flag — [Implicit]

`draft: true` hides a project from the site.

### Projects sort newest year first, then by English title — [Explicit]

Automatic, with no order field; the English title keeps the order the same in
both languages.

### The home page is the About page — [Explicit]

Following the architect's wireframe: images at the top, then About (bio left,
portrait right), then Approach. All of it is edited in the one **Home page**
entry.

### Home image or carousel — [Explicit]

The architect picks and orders at least one home image; project images are never
added automatically. One image shows at its natural aspect ratio; two or more
form a carousel with arrows and dots that auto-advances, pausing on hover or
focus; with reduced motion it does not auto-advance. Controls over images keep a
high-contrast palette in both themes.

### Work page: a grid of square covers — [Explicit]

Three columns of each project's first image as a square crop, with title, year
and location; hover enlarges the whole tile. Two and then one column on narrower
screens — [Implicit]. The grid holds the projects with at least one image; the grid
cards do not show the brief — [Implicit].

### Work page: a list of projects without images — [Explicit]

All other projects follow the grid after a thin rule, as a compact text list in
the same order: title and year on one line, then location and brief. A row links
to its project page only when the project has content blocks, and a linked
row's title is underlined on hover and focus — [Implicit]. With
no such projects, neither the rule nor the list shows — [Implicit].

### Approach section — [Explicit]

How the architect works, as a vertical list of items with no dividers, as she
preferred; each icon enlarges from its centre on hover. The items (label, text
and which icon) are added, removed and reordered in the CMS.

The four icons themselves are fixed in code — [Implicit].

### Contact page — [Explicit]

Email, phone and a per-day "When to reach me" schedule (likely-to-answer times,
"—" when unavailable), all editable. The email is also in the footer. No contact
form: there is no backend to receive one.

---

## Language

### Dual language (Czech + English) — [Explicit]

Every visible string exists in both languages, CMS content and baked-in labels
alike, including screen-reader labels. Project covers are decorative to
assistive technology because the adjacent title already names them.

### Auto-detected, with a manual switch in the footer — [Explicit]

The language comes from a saved choice, else the browser, else English. The
footer button shows the language it switches _to_, switches without a reload and
saves the choice. It sits in the footer, not the nav, because with
auto-detection it is a fallback, and in the nav it confused the architect.

---

## Interactivity & motion

### Alive and smooth, but no scroll hijacking — [Explicit]

Motion rides the native scrollbar and stays subtle.

### Page transitions — [Implicit]

Where the browser supports cross-document View Transitions, pages crossfade and
a project's first image moves between its work card and its project page,
changing crop on the way; elsewhere, ordinary navigation. The moving image is
one image, starting from the card's hover zoom — [Explicit]. It moves only when
the first block is an image block, so the image is at the top of the page; when
the first block is text, the pages just crossfade — [Implicit].

### Fade-in on scroll, as decoration only — [Implicit] / [Explicit]

Content eases in as it scrolls into view [Implicit]. The page looks and works
the same without it [Explicit]: nothing hides without JavaScript, and nothing
already on screen fades in late.

### Dark mode — [Explicit]

Charcoal background and off-white text; photos and drawings are never inverted.
Follows the system preference until the visitor uses the footer toggle (moon or
sun, showing the mode it switches to), which is remembered.

### Reduced motion — [Implicit]

With `prefers-reduced-motion` there are no fades, hover zooms, slides, blends
or turns; changes happen at once or crossfade. The same input reaches the same
states at the same moments.

### Nothing waits for an animation — [Explicit]

Every input changes state at once, and animations chase it: pressing Next five
times quickly lands five images on, in carousels and the lightbox alike, and the
controls describe the new image straight away. A change mid-animation carries on
from where things are on screen, and a drag grabs whatever is moving where it
is; when a visitor swipes a carousel, its dots follow. Where the rule leaves
room — [Implicit]:

- A fast run of changes travels to the last image without showing or loading
  the ones skipped.
- A blend waits for its drawing to load rather than blending to black.
- Opening and closing take input too: closing hands the page back at once, and
  opening again turns the close around.
- The address follows every change, rate-limited only during a held key.

---

## Project pages and the lightbox

### Ordered blocks — [Explicit]

A project page is an ordered list of text, thumbnail-gallery and full-width
image-set blocks, in any order and repeated freely. A one-image set is a plain
image; more form a manual carousel.

### Project text fills the width with comfortable columns — [Explicit]

Text blocks fill the same available width as the images, splitting into balanced
columns to keep lines comfortable to read. Columns appear only when each can
retain a comfortable minimum width; intermediate widths allow longer single
lines to preserve the full-width layout — [Implicit]. The minimum follows
[Rutter's multiple-column reading guidance](https://webtypography.net/2.1.2)
— [Implicit].

### One lightbox per page, full-screen, controls in the corners — [Explicit]

Every image occurrence is one sequence in page order, each with
its own title and description even when an upload repeats. The drawing fills the
screen over a dark backdrop, with separate controls in the corners and arrows on
the sides; the arrow keys change image too. At 100% nothing covers the image;
zoomed, any part can be panned clear of the controls.

### Opening morphs from the thumbnail — [Explicit]

The clicked image grows into the lightbox and returns on close, unless the
thumbnail is not fully in view or under the header, or the image is zoomed or
turned, in which case it fades.

### Addressable images — [Explicit]

Each open image has a shareable `#image-N` address, by position, so reordering a
project's images changes it. Moving between images adds no history steps: Back
closes the lightbox, Forward reopens it, and a directly loaded `#image-N` link
closes to the project page before Back leaves it.

### Accessible modal — [Explicit]

Focus moves in on open, cycles inside, and returns to the thumbnail on close
without moving the page. Clicking the backdrop does not close it; ×, Escape and
Back do. Labels follow the site language and a live status announces the
position.

### Inspection: zoom, pan, swipe — [Explicit]

Wheel and pinch zoom toward the pointer, up to native pixel detail; drag pans
when zoomed and double-click or double-tap toggles zoom. At 100% a horizontal
drag slides to the neighbouring image, snapping back if short. `+`/`-`/`0` zoom
too, and a second finger turns a swipe into a pinch — [Implicit].

### High-detail drawings — [Explicit]

Previews use prefiltered responsive images so fine linework does not alias. The
lightbox loads more detail as the visitor zooms, and large drawings use
deep-zoom tiles so only visible regions load. Uploads are never enlarged or
altered; the original is one click away.

### Comparison sets: variants of one card — [Explicit]

Images sharing a comparison set stay ordinary images on the page; in the
lightbox they are variants of one card, switched by a set strip of named
buttons. Moving to a variant blends in place and keeps zoom and pan, so aligned
plans can be compared, and a sideways drag towards it scrubs the blend. The
strip stays one row and scrolls sideways — [Implicit].

### Titles and descriptions; the card's back — [Explicit]

Optional bilingual title and description per image, shown only in the lightbox.
The title shows in the top-left set strip: a titled image outside a set gets a
strip of one, an image with neither title nor set gets none. A description lives
on the card's back, reached with the bottom-left toggle, which turns the card
over in 3D:

- The back is paper in the page's theme, the drawing's shape and size, growing
  only as far as its text needs — [Explicit]; a card taller than the screen
  scrolls as a page — [Explicit], its scrollbar shown only on the back —
  [Implicit].
- The turn zooms out to the whole card and back to the exact view left —
  [Explicit].
- On the back, a sideways swipe only turns the card back, rotating the way the
  finger moves — [Explicit]; a mouse selects text, so the mouse uses the toggle
  — [Explicit]. Other turns go the way the change travels — [Implicit].
- On phones the edge arrows slide aside while the text shows — [Explicit], and
  return as the next card slides in — [Implicit].
- Any change of image shows the new image drawing side up.

---

## Reach

### Custom domain at the root — [Explicit]

Served at the architect's own domain; the `*.github.io` URL redirects to it.

### SEO and sharing — [Implicit]

Per-page title and description, Open Graph tags and a sitemap. Tab titles pair
page and credentialed name with `|`, e.g. "Work | Ing. arch. Tereza Kalábková"
— [Explicit].

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

### Black-and-white visual language — [Explicit]

White background, black text throughout; greys are allowed for secondary text
(dates, locations, captions). Any colour comes from the project imagery and the
architect's drawings, never from the UI chrome. From her design brief, and in
keeping with the near-monochrome reference sites she cited (maaus.cz,
storyarchitekti.cz).

### Nav links have three states — [Explicit]

The menu is just **Work** and **Contact** — there is no "Home" link, because the
home page is reached by clicking the name wordmark. Each link has three states:

- **Idle:** plain text, no highlight.
- **Hover:** a black square (outline box) around the link.
- **Current page / clicked:** inverted — white text in a solid black box.

Menu labels are set uppercase with wide tracking. (This supersedes the
underline-based affordance in her original brief; she revised it to the
none → box → invert scheme.)

This is the site's shared interaction vocabulary — **outline box on hover,
inverted (solid black) on press/selected** — and it is reused for other controls,
notably the carousel arrows and dots, so interaction feels consistent everywhere.
Plain text links (email, phone, footer) keep a simple underline instead, which
reads better inline than a box.

### Typeface: Roboto throughout — [Explicit]

The whole page is set in Roboto — the same font as the nav's WORK/CONTACT links —
at the architect's request. She had also listed Open Sans and DIN Pro as fonts she
likes; Open Sans was the body font at first but was dropped when she asked for one
typeface everywhere, and DIN Pro is commercial with no free web licence, so it is
not used (see ARCHITECTURE.md → "Self-hosted webfonts").

---

## Content & maintenance

### The architect maintains content themselves — [Explicit]

A non-technical person must be able to add/edit projects without touching code,
Git, or Markdown. This is the core reason a CMS exists in the project at all.

### Most page content is editable in the CMS — [Explicit]

The architect asked for as much of the site as possible to be editable in Pages
CMS, with only the general scaffolding baked into code. Editable: projects, the
home page (bio, portrait, carousel images, Approach items), the contact details,
and a small set of Site settings (name, credential, SEO text). Baked in: page
structure, navigation, and section labels ("Work", "About", "Approach",
"Contact"). The CMS entries mirror the pages — **Home**, **Projects**,
**Contact**, and global **Site settings** — each backed by a file under
`src/content/singletons/` (or the `projects` collection).

### Larger changes are made by the developer — [Explicit]

Structural/design changes are done in code by the developer, on the same repo.
Content edits and code edits share one source of truth and don't conflict.

### Browser-based editing via Pages CMS — [Explicit]

The architect edits at app.pagescms.org: friendly forms, drag-and-drop image
upload, no server to run. Saving commits to `master` and the site redeploys.

### Projects have title, year, and optional location — [Implicit]

The fields exposed for each project. `location` is optional; `title` and `year`
are required.

### Editable site settings — [Explicit]

A small "Site settings" CMS entry holds the owner's name, credential (e.g. "Ing.
arch."), and the SEO description. These feed the nav wordmark, the footer
copyright, and the default meta description, so they are changed in one place
rather than being scattered through the code.

### Draft flag to hide unfinished projects — [Implicit]

A project marked `draft: true` is excluded from the site. Lets the architect
stage work before publishing.

### Projects sort newest-first, then alphabetically — [Explicit]

Projects on the Work page sort by `year` descending (newest first), then by
title A–Z as a tie-breaker within the same year. This is fully automatic — there
is no manual "sort order" field to maintain (an earlier `order` number existed but
was dropped when the architect asked for this year-then-alphabetical rule).

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
not auto-advance for visitors who prefer reduced motion. The images can be curated in the CMS
(the Home entry's gallery); when that list is left empty it falls back to every
project's cover + gallery photos, so it stays current with no maintenance —
[Implicit].

### Work page lists the projects — [Explicit]

Projects live on their own `/work` page, separate from the About home page. The
layout is a **three-column** grid of **square** cover images, each with its title
(and year/location) underneath. Hovering a card **enlarges the whole image** a
little — the entire tile scales up, rather than the old zoom-within-a-fixed-frame.
On narrower screens the grid steps down to two columns, then one — [Implicit].

### "Approach" section on the home page — [Explicit]

A section below the bio describing how the architect works, as a **vertical**
stack of items (Place, Scale, Material, Thinking); each item's icon enlarges on
hover. She asked for this space and preferred it laid out vertically rather than
as the horizontal row on the reference site (maaus.cz), and without dividing
lines between items. The items (label, text, and which of four line icons) are
editable in the CMS (the Home entry) and can be added, removed, or reordered; the
text ships as placeholder wording. The icon set (place/scale/material/thinking)
is fixed in code — [Implicit].

---

## Interactivity & motion

### Some interactivity and smoothness — [Explicit]

The user wanted the site to feel alive and smooth.

### No heavy animation, no scroll hijacking — [Explicit]

An explicit boundary: the user finds reimplemented/hijacked scrolling annoying.
Motion must ride the native scrollbar and stay subtle.

### Smooth page-to-page transitions — [Implicit]

Navigating between pages crossfades instead of a hard reload, via the browser's
native View Transitions. Delivers "smoothness" without a heavy SPA.

### Fade-in-on-scroll — [Implicit]

Content eases in as it scrolls into view, using the real scrollbar (no
hijacking). Honors the explicit motion boundary.

### Page colour-invert — deferred

The architect's brief floated inverting the page to white-on-black ("after
clicking — the opposite"). A first pass (a CSS `filter` invert toggled from the
footer) fought the sticky nav and View Transitions, so it was **removed for now**
and is to be revisited — there is currently no invert control on the site.

### Image lightbox / gallery — [Implicit]

Project images open in a full-screen, keyboard-navigable lightbox (arrows, Esc).
This is the concrete "interactivity" the user asked for.

### Respects reduced-motion preferences — [Implicit]

Users who set `prefers-reduced-motion` get no fade/transform animation.

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

### Contact page — email, phone, and when she's reachable — [Explicit]

A dedicated `/contact` page (same content width as the rest of the site, laid out
in two columns like the About section) shows the email (mailto) and phone (tel
link), plus a **per-day availability schedule** under the heading "When to reach
me" — framed as when she's active and likely to pick up, not formal "opening
hours", with one row per day (hours, or "—" when she's not around). The email also appears in
the global footer. All of it — email, phone, and the day-by-day availability — is
editable in the CMS (the Contact entry). No contact form (no backend to process
one, and it keeps things simple).

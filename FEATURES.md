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

Neutral palette, generous whitespace, work shown in a simple grid. Placeholder
branding ("Architect Name") is intended to be replaced. Agent chose this direction;
the user did not specify an aesthetic beyond "clean".

---

## Content & maintenance

### The architect maintains content themselves — [Explicit]

A non-technical person must be able to add/edit projects without touching code,
Git, or Markdown. This is the core reason a CMS exists in the project at all.

### Larger changes are made by the developer — [Explicit]

Structural/design changes are done in code by the developer, on the same repo.
Content edits and code edits share one source of truth and don't conflict.

### Browser-based editing via Pages CMS — [Explicit]

The architect edits at app.pagescms.org: friendly forms, drag-and-drop image
upload, no server to run. Saving commits to `master` and the site redeploys.

### Projects have title, year, and optional location — [Implicit]

The fields exposed for each project. `location` is optional; `title` and `year`
are required.

### Draft flag to hide unfinished projects — [Implicit]

A project marked `draft: true` is excluded from the site. Lets the architect
stage work before publishing.

### Manual ordering, newest-first fallback — [Implicit]

Projects sort by an `order` number, then by `year` descending. Gives the
architect control over the front-page sequence.

### Editable About page — [Implicit]

A single About page (bio + portrait + contact) is editable through the CMS like
projects are.

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

### Image lightbox / gallery — [Implicit]

Project images open in a full-screen, keyboard-navigable lightbox (arrows, Esc).
This is the concrete "interactivity" the user asked for.

### Respects reduced-motion preferences — [Implicit]

Users who set `prefers-reduced-motion` get no fade/transform animation.

---

## Reach

### Custom domain — [Explicit]

The site is served on the architect's own domain (chosen from the offered
hosting options).

### Basic SEO & sharing — [Implicit]

Per-page title/description, Open Graph tags, and a generated sitemap so pages
index and share cleanly.

### Contact by email — [Implicit]

A mailto link in the footer and About page. No contact form (no backend to
process one, and it keeps things simple).

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

### CI/CD: GitHub Actions → Pages — [Implicit]

`.github/workflows/deploy.yml` builds with `withastro/action` (configured for
bun) and deploys via `actions/deploy-pages`; a push to `master` is the trigger.

---

## Framework & language

### Static site generator: Astro — [Implicit]

Proposed as the best fit for an image-heavy, mostly-static portfolio: ships zero
JS by default, supports partial hydration ("islands"), first-class Markdown
content. The user accepted the recommended stack without pushback.

### Language: TypeScript — [Explicit]

Chosen from the offered options (over plain JavaScript). Uses Astro's `strict`
tsconfig. The content schema in `src/content.config.ts` is the main place types
earn their keep.

### Runtime / package manager: bun — [Explicit]

The user named bun ("use bun instead of node") and delegated the final call;
Agent confirmed it as a good fit. Used only at build/dev time — nothing bun-
specific ships to production.

### Dev environment: minimal Nix flake — [Explicit]

`flake.nix` provides only bun, for `x86_64-linux`, with no description or
shellHook — the user explicitly asked for a minimal flake. `.gitignore` was
likewise trimmed on request.

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
(`client:visible`). The only other browser JS is a few tiny first-party vanilla
scripts (reveal-on-scroll, the home carousel, the language switch) and the
View-Transitions router — no framework runtime ships beyond the lightbox.

### Home-page carousel: scroll-snap + a small vanilla script — [Implicit]

The carousel (`Carousel.astro`) is a native horizontal scroll-snap strip; a small
vanilla script enhances it with arrows, dot indicators and a 5s auto-advance,
pausing on hover/focus and skipping auto-advance under `prefers-reduced-motion`.
No hydrated island — the same lightweight approach as the reveal script, so the
"islands stay minimal" invariant holds. Because it scrolls its own container (not
the page), it stays clear of the "don't reimplement scrolling" boundary. Images
come from the Home singleton's `gallery` list, falling back to
`getCollection('projects')` (cover + gallery) when it is empty, so there is no
separate gallery content to maintain. The arrows/dots use the site's shared
interaction language (outline box on hover, invert on press/current).

### Page transitions: native View Transitions API — [Implicit]

`<ClientRouter />` in `Base.astro` gives smooth crossfades between pages using
the browser-native API, with near-zero JS. Chosen to satisfy the explicit want
for "smoothness" without a heavy client router.

### Reveal-on-scroll: IntersectionObserver on the native scrollbar — [Implicit]

Elements with `.reveal` fade in as they enter the viewport (script in
`Base.astro`, styles in `global.css`). This explicitly avoids scroll-hijacking
libraries — the user asked not to reimplement scrolling. Re-runs on
`astro:page-load` so it works after View Transition navigations. Respects
`prefers-reduced-motion`.

---

## Styling

### Tailwind CSS v4 via the Vite plugin — [Implicit]

`@tailwindcss/vite` plus `@import "tailwindcss"` in `global.css`. No
`tailwind.config` file — v4 is configured in CSS.

### Typography plugin for Markdown bodies — [Implicit]

`@tailwindcss/typography` (`prose` classes) styles rendered Markdown bodies — the
project descriptions and the home page's About text. Because those bodies are
bilingual they live in frontmatter fields (`body_cs`/`body_en`), not the file's
Markdown body, so they're rendered from their Markdown strings with `marked` (a
tiny build-time dependency) inside `Prose.astro` rather than via Astro's
`render()`. See "Internationalization" below.

### Self-hosted webfonts via @fontsource — [Implicit]

Roboto ships as a variable webfont from `@fontsource-variable/roboto`, imported in
`Base.astro` and bundled to `dist/_astro/*.woff2` — no third-party (Google Fonts)
request, which keeps with "fast and clean". It is the single page typeface:
`global.css`'s `@theme` sets one token, `--font-sans`, to Roboto, so body,
headings and nav all share it. There is deliberately **no** separate
display/heading token — Open Sans (body) and a `--font-display` seam were both
tried and removed in favour of one typeface everywhere (the owner's call: "if I
want separation later, I'll do it from scratch"). DIN Pro — also on her wishlist —
is commercial with no free web licence and is omitted; to add it (or any distinct
heading face) later, self-host the licensed `woff2`, reintroduce a `--font-display`
token in `@theme`, and apply it to the headings/nav.

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
Components guard for missing/empty fields (e.g. an empty Home gallery falls back to
project photos; an empty approach list hides the section). All human-readable text
is bilingual (paired `_cs`/`_en` fields); the Markdown file *bodies* are unused —
even the bio and project descriptions live in `body_cs`/`body_en` frontmatter.

### Images: `public/uploads`, referenced as string paths — [Implicit]

Images live in `public/uploads` and are referenced by root-absolute string paths
(e.g. `/uploads/cover.jpg`), rendered with plain `<img loading="lazy">`. This was
chosen over Astro's `astro:assets` optimizer specifically so the CMS flow stays
bulletproof: the CMS just commits a file and writes a path, with no import
resolution to get wrong. Trade-off: no automatic AVIF/WebP generation. The
upgrade path (move images into `src/`, switch to `<Image>`) is documented in
MAINTAINERS.md.

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
else English. A second module script in `Base.astro` wires the footer **CZ | EN**
toggle (persists to `localStorage`, flips `data-lang`), syncs `<title>`/meta
description to the active language, and on `astro:before-swap` copies the current
language onto the incoming document so a View Transition doesn't reset it. No
island — same "tiny vanilla script" approach as reveal/carousel.

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
must stay in sync (see below). Sorting/slugs use the English field for stability
(the project filename, hence URL slug, derives from `title_en`).

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
the pair to keep in sync is `.pages.yml` and the consuming component.

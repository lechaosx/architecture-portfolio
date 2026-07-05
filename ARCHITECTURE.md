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

### Dual deployment: project path OR custom domain — [Explicit]

The site must work both at the GitHub Pages project URL
(`https://<owner>.github.io/<repo>/`) and at a custom domain root — the user
asked for both. The two have _different_ mount points (`/repo/` vs `/`), and a
static build bakes absolute asset paths, so a single build can only target one
mount point. The mechanism (the implementation choices below are [Implicit]):

- **Targets are declared in `deploy.config.json`** (in-repo, declarative). Each
  target has a `base` (required — the mount path), an optional `site` (origin),
  and an optional `cname`. An `active` field selects one. Switching targets is a
  one-field edit — no code changes, no CI logic, no env vars. The user explicitly
  wanted deployment config in-repo rather than in the pipeline.
- **`astro.config.mjs` just applies the active target.** It sets `site`/`base`
  from the config and emits `dist/CNAME` from `cname` via a build hook. No
  repo/owner/domain literals in code.
- Every internal link and asset path goes through `withBase()` in
  `src/lib/url.ts`, so any `base` resolves correctly. Hardcoding a `/…` path
  bypasses this and breaks the project-path build.
- `public/CNAME` is **not** committed; it's generated at build for custom-domain
  targets.
- `site` (and therefore the sitemap) is **optional**: it only affects absolute
  SEO URLs, not whether the site works at a given URL — `base` is the only
  functionally required setting.

GitHub Pages behavior: once a custom domain is configured, the
`*.github.io/repo/` URL 301-redirects to the custom domain — so both URLs resolve
for visitors, but you build for one canonical mode at a time.

### CI/CD: GitHub Actions → Pages — [Implicit]

`.github/workflows/deploy.yml` builds with `withastro/action` (configured for
bun) and deploys via `actions/deploy-pages`; a push to `master` is the trigger.
The workflow carries no deploy-target logic — it just builds; the target comes
from `deploy.config.json` (see above).

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
(`client:visible`). Everything else ships no JS.

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

`@tailwindcss/typography` (`prose` classes) styles rendered Markdown on project
and about pages.

---

## Content

### Astro Content Collections + glob loader — [Implicit]

`src/content.config.ts` defines a `projects` collection loaded from
`src/content/projects/*.md`, with a Zod schema validating frontmatter. The About
page is a single Markdown file imported directly in `about.astro` (not a
collection — it's a one-off).

### Images: `public/uploads`, referenced as string paths — [Implicit]

Images live in `public/uploads` and are referenced by root-absolute string paths
(e.g. `/uploads/cover.jpg`), rendered with plain `<img loading="lazy">`. This was
chosen over Astro's `astro:assets` optimizer specifically so the CMS flow stays
bulletproof: the CMS just commits a file and writes a path, with no import
resolution to get wrong. Trade-off: no automatic AVIF/WebP generation. The
upgrade path (move images into `src/`, switch to `<Image>`) is documented in
MAINTAINERS.md.

### Sitemap — [Implicit]

`@astrojs/sitemap` generates `sitemap-index.xml` at build. Needs `SITE` set
correctly to produce valid URLs.

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
by hand — see MAINTAINERS.md and AGENTS.md.

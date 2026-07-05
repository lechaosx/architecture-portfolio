# Maintainers' guide

For the **developer** working on this codebase. If you're the site owner just
trying to edit content or go live, see [README.md](README.md) instead.

Background reading: [ARCHITECTURE.md](ARCHITECTURE.md) (why the code is shaped
this way), [FEATURES.md](FEATURES.md) (why it behaves this way).

---

## Prerequisites

- [Nix](https://nixos.org) with flakes enabled (provides bun), **or** bun
  installed directly.

## Everyday commands

```sh
nix develop          # shell with bun on PATH
bun install          # install dependencies
bun dev              # dev server at http://localhost:4321
bun run build        # production build -> dist/
bun run preview      # serve the built dist/ locally
```

## Project layout

```
flake.nix                     minimal dev shell (bun, x86_64-linux)
deploy.config.json            deployment targets (base/site/cname) + active selector
astro.config.mjs              applies the active deploy target; emits CNAME
svelte.config.js              Svelte preprocess
tsconfig.json                 extends astro/tsconfigs/strict
.pages.yml                    Pages CMS schema (the browser editing UI)
.github/workflows/deploy.yml  build with bun + deploy to Pages on push to master

src/
  lib/url.ts                  withBase()/stripBase() — base-aware links & assets
  content.config.ts           projects collection schema (Zod)
  content/projects/*.md        one file per project
  content/singletons/about.md  the About page
  pages/
    index.astro                home: project grid
    projects/[...slug].astro   project detail page
    about.astro                imports about.md directly
  layouts/Base.astro           html shell, <ClientRouter/>, reveal-on-scroll script
  components/
    Nav.astro, Footer.astro    chrome
    ProjectCard.astro          grid card
    Gallery.svelte             the ONLY hydrated island (lightbox)
  styles/global.css            tailwind import + typography plugin + .reveal styles

public/
  uploads/                     images (placeholder .svg files here now)
  favicon.svg
                               (CNAME is not committed — the workflow writes it)
```

---

## Common tasks

### Add or edit a project

Two ways, same result (a Markdown file in `src/content/projects/`):

- **Via CMS** (how the architect does it): app.pagescms.org → Projects → new.
- **By hand:** copy an existing file in `src/content/projects/`, edit the
  frontmatter, drop images in `public/uploads/` and reference them as
  `/uploads/<file>`.

Frontmatter shape is defined in `src/content.config.ts`.

### Change the content schema — update BOTH places

The content shape is declared **twice** and they must agree:

1. `src/content.config.ts` — the Zod schema (build-time validation).
2. `.pages.yml` — the Pages CMS fields (the editing UI).

If you add/rename/remove a field in one, do the same in the other in the **same
change**. A mismatch means either the build fails (schema stricter than CMS) or
the architect can't edit a field the site expects (CMS missing a field). This is
the project's sharpest maintenance edge — see AGENTS.md.

### Switch between project-URL and custom-domain hosting

Deployment targets live in `deploy.config.json`. Change the `active` field:

- `"active": "github"` → GitHub Pages project URL (base `/architecture-portfolio`).
- `"active": "custom"` → custom domain at the root; `dist/CNAME` is written from
  that target's `cname`.

Each target has `base` (required — the mount path), `site` (optional — only feeds
the sitemap's absolute URLs), and `cname` (optional — custom domains). Add or edit
targets freely. Nothing else — no code, no CI, no env vars — changes to switch.

**Test locally:** `bun run build` builds whichever target is `active`; inspect
`dist/`.

New internal links/assets must go through `withBase()` from `src/lib/url.ts` —
never hardcode a leading-slash path, or it will 404 on the project-URL build.

### Add another interactive island

Create a `.svelte` component and mount it in an `.astro` file with a client
directive (`client:visible`, `client:idle`, etc.). Keep islands small — the whole
point is that the rest of the page ships no JS.

---

## Deployment

1. Push to GitHub. Repo **Settings → Pages → Source = GitHub Actions**.
2. To use a custom domain: set `"active": "custom"` in `deploy.config.json` (with
   the domain in that target), add the same domain under Settings → Pages, and
   point DNS at GitHub Pages. Leave it as `"github"` to serve from the project URL.
3. Every push to `master` runs `.github/workflows/deploy.yml` (build with bun →
   deploy). No manual step.

## Content editing setup (Pages CMS)

Connect the repo once at [app.pagescms.org](https://app.pagescms.org) (sign in
with GitHub, grant the app access to the repo). It reads `.pages.yml`. No proxy
or server — this is why Pages CMS was chosen over Sveltia. See ARCHITECTURE.md.

---

## Known gaps / things to verify

- **Pages CMS behavior is untested end-to-end** (it's hosted; needs the live
  repo). After connecting, create one test project through the UI and confirm the
  committed file matches the shape of `src/content/projects/villa-solis.md`. Two
  things to check specifically:
  - `filename: '{fields.title}.md'` produces a clean, slugified filename (Astro
    derives the URL slug from the filename).
  - the `rich-text` "body" field is written as the Markdown body (not into
    frontmatter).
  If either is off, it's a small `.pages.yml` tweak.
- **No image optimization.** Images are served as-is from `public/uploads` with
  native lazy-loading. For automatic AVIF/WebP: move images into `src/`, add an
  `image()` field to the collection schema, and render with `astro:assets`
  `<Image>`/`<Picture>`. Note this complicates the CMS path handling — weigh it.
- **Placeholders to replace before launch:** the `.svg` files in
  `public/uploads/`, the `hello@example.com` contact email (in `Footer.astro` and
  the About content), the sample projects, plus the domain (see above). The
  architect's name (Tereza Kalábková) is already set in `Nav.astro`,
  `Footer.astro`, page titles, and the About bio.

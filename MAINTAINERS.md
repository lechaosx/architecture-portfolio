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
astro.config.mjs              site (for sitemap) + integrations; no base
svelte.config.js              Svelte preprocess
tsconfig.json                 extends astro/tsconfigs/strict
.pages.yml                    Pages CMS schema (the browser editing UI)
.github/workflows/deploy.yml  build with bun + deploy to Pages on push to master

src/
  content.config.ts           projects collection schema (Zod)
  content/projects/*.md        one file per project
  content/singletons/          CMS singletons: site.md, home.md, contact.md
  pages/
    index.astro                home: carousel + home.md (bio, portrait, approach)
    work.astro                 project grid
    contact.astro              email, phone, per-day availability (from contact.md)
    projects/[...slug].astro   project detail page
  layouts/Base.astro           html shell, <ClientRouter/>, reveal-on-scroll script
  components/
    Nav.astro, Footer.astro    chrome (name/email from site.md + contact.md)
    Carousel.astro             home hero carousel; images from home.md or projects
    Approaches.astro           vertical "how I work" list (items from home.md)
    ProjectCard.astro          grid card
    Gallery.svelte             the ONLY hydrated island (lightbox)
  styles/global.css            tailwind import, fonts, .reveal + .no-scrollbar

public/
  uploads/                     images (placeholder .svg files here now)
  favicon.svg
  CNAME                        the custom domain (committed, copied to dist/)
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

This double-declaration applies to the **`projects` collection**. The
**singletons** (`src/content/singletons/*.md`: site, home, contact) have
**no Zod mirror** — they're declared only in `.pages.yml` and read straight from
their Markdown by the component that imports them. So for a singleton field, keep
`.pages.yml` and the consuming component in sync, and have that component tolerate
missing/empty values (the current ones already do).

### Change the domain

The site serves from a single custom domain at the root. To change it, edit
`public/CNAME` (one line, the bare domain) and update `site` in
`astro.config.mjs` to the matching `https://…` origin (that value only feeds the
sitemap). Then update the domain under GitHub **Settings → Pages** and its DNS.

Internal links and assets are plain root-absolute paths (`/work`,
`/uploads/…`) — there is no `base` and no link helper, because the site is
mounted at the root. Don't reintroduce a `base`/subpath deployment without also
routing every link/asset through a base-aware helper; see ARCHITECTURE.md →
"Hosting: custom domain at the root" for why root-only keeps the code simple.

### Add another interactive island

Create a `.svelte` component and mount it in an `.astro` file with a client
directive (`client:visible`, `client:idle`, etc.). Keep islands small — the whole
point is that the rest of the page ships no JS.

---

## Deployment

1. Push to GitHub. Repo **Settings → Pages → Source = GitHub Actions**.
2. The site serves from the custom domain in `public/CNAME`: add the same domain
   under Settings → Pages and point its DNS at GitHub Pages.
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
  `public/uploads/`, the sample projects, and the domain (see above). Contact
  details are placeholders in `src/content/singletons/contact.md`
  (`info@kalabkova.cz`, `+420 777 123 456`) and the owner name in `site.md` — all
  editable via the CMS. Site-wide text (name, credential, email, phone, hours) now
  comes from those singletons, not from hardcoded strings in components.

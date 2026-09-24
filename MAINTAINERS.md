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
direnv allow         # alternatively, activate the flake shell automatically
bun install          # install dependencies
bun dev              # dev server at http://localhost:4321
bun run check        # Astro, Svelte, TypeScript, and JavaScript diagnostics
bun run test         # unit tests
bun run test:e2e     # Chromium + Firefox interaction and animation regressions
bun run test:all     # static analysis + unit + browser tests
bun run build        # production build -> dist/
bun run preview      # serve the built dist/ locally
```

`test:e2e` builds the production site, including responsive images, before
Playwright starts its preview server on `http://127.0.0.1:4322`, separate from
Astro's default development port. Cold image processing is therefore not counted
against the server startup timeout, and routes are not compiled during interaction
tests. CI persists `node_modules/.astro` after that prebuild; the
deployment build and later workflow runs reuse its content-addressed image cache.

## Project layout

```
flake.nix                     bun + packaged Playwright browsers (x86_64-linux)
.envrc                        automatic flake shell activation with direnv
astro.config.mjs              site (for sitemap) + integrations; no base
svelte.config.js              Svelte preprocess
tsconfig.json                 extends astro/tsconfigs/strict
.pages.yml                    Pages CMS schema (the browser editing UI)
.github/workflows/deploy.yml  test, build with bun, and deploy on push to master

src/
  images.ts                    responsive derivative URL/srcset contract
  server-images.ts             reads the generated image manifest during builds
  content.config.ts           projects collection schema (Zod); bilingual fields
  i18n.ts                      baked-in UI labels ({cs, en} dictionary)
  content/projects/*.md        one file per project (text in _cs/_en frontmatter)
  content/singletons/          CMS singletons: site.md, home.md, contact.md
  pages/
    index.astro                home: image/carousel + home.md (bio, portrait, approach)
    work.astro                 project grid
    contact.astro              email, phone, per-day availability (from contact.md)
    projects/[...slug].astro   project detail page
  layouts/Base.astro           html shell, reveal + language scripts
  components/
    Nav.astro                  chrome (name from site.md)
    Footer.astro               chrome (email from contact.md) + language/theme toggles
    T.astro                    renders both languages of a label/string (CSS hides one)
    Prose.astro                renders both languages of a rich-text body (via marked)
    Carousel.astro             home hero image/carousel; images from home.md
    Approaches.astro           vertical "how I work" list (items from home.md)
    ProjectCard.astro          grid card
    ProjectBlocks.astro        ordered project text/gallery/image-set renderer
    Gallery.svelte             the ONLY hydrated island (page-level lightbox)
  styles/global.css            tailwind import, fonts, .reveal, .no-scrollbar, lang rule

public/
  uploads/                     original CMS image uploads
  _responsive/                generated derivatives + manifest (gitignored)
  favicon.svg
  CNAME                        the custom domain (committed, copied to dist/)

scripts/
  image-cache.ts                content + recipe cache fingerprint
  generate-responsive-images.ts  builds referenced raster display sizes
tests/e2e/                     browser-level interaction regressions
```

---

## Common tasks

### Add or edit a project

Two ways, same result (a Markdown file in `src/content/projects/`):

- **Via CMS** (how the architect does it): app.pagescms.org → Projects → new.
- **By hand:** copy an existing file in `src/content/projects/`, edit the
  frontmatter, drop images in `public/uploads/` and reference them as
  `/uploads/<file>`.

Frontmatter shape is defined in `src/content.config.ts`. The Markdown filename
supplies the route under `/projects/`. Pages CMS exposes the complete filename;
keep its `.md` extension when renaming it.

Project pages are ordered block lists. Text is independent of image blocks;
`image_set` displays one image directly or multiple images as a carousel:

```yaml
blocks:
  - type: text
    body_cs: Český text
    body_en: English text
  - type: gallery
    images:
      - image: /uploads/drawing.jpg
        comparison_set: site-plan
        title_cs: Původní stav
        title_en: Existing condition
      - image: /uploads/proposal.jpg
        comparison_set: site-plan
        title_cs: Návrh
        title_en: Proposal
  - type: image_set
    images:
      - image: /uploads/render-1.jpg
        title_cs: České jméno
        title_en: English title
      - image: /uploads/render-2.jpg
```

The four caption fields are optional; omit them to show only the enlarged image.
An optional language-neutral `comparison_set` groups records with the same exact
value across any image blocks on that project. The existing bilingual titles
name the lightbox shortcuts. Grouping is lightbox-only and does not change how
each preview is rendered on the project page.
The cover and every image block feed one lightbox in page order. Lightbox links
use that position (`#image-1`, `#image-2`, …), so reordering blocks or images
also changes those addresses. A repeated `image` path is a separate lightbox
entry at each occurrence. The Gallery island uses `client:load`
so a directly opened image address is handled as soon as the project loads.
Raster uploads referenced by content are converted automatically before `dev`
and `build`; do not commit `public/_responsive`. Reduced image surfaces use the
generated variants. The lightbox chooses among them using its rendered size,
display density, and zoom. The final full-image candidate is a processed
native-resolution representation when that is smaller than the original;
otherwise the original is retained as the efficient fallback. Images whose
longest side exceeds 4096 px also receive 512 px DZI tiles and use a lazily
loaded OpenSeadragon canvas in the lightbox. Encoded files and pyramids are
reused from `node_modules/.astro/images`; `bun run images` reports their generated
and reused counts. Widths above the source resolution are never generated. The
pipeline auto-orients derivatives and normalizes them to sRGB. PNG and
alpha-bearing inputs use lossless WebP; other raster inputs use high-quality
lossy WebP. Pyramid levels are Lanczos-resized directly from the original rather
than recursively reduced. Lossless tiles overlap by 1 px; lossy tiles overlap by
16 px so WebP boundary filtering does not reach their visible cores. The deploy
workflow's Astro action persists the cache between CI runs. Cache loss only
makes the next build slower—it does not change its output.

Uploads may keep spaces, accents, and `+` characters in their filenames. The
manifest stores the original upload URL separately from its display fallback.
For a `+` path, the build publishes the same source bytes at a hash-only display
URL because Astro preview cannot serve that encoded path reliably; **Open
original** still uses the untouched upload and its real filename.

### Change the content schema — update BOTH places

The content shape is declared **twice** and they must agree:

1. `src/content.config.ts` — the Zod schema (build-time validation).
2. `.pages.yml` — the Pages CMS fields (the editing UI).

If you add/rename/remove a field in one, do the same in the other in the **same
change**. A mismatch means either the build fails (schema stricter than CMS) or
the architect can't edit a field the site expects (CMS missing a field). This is
the project's sharpest maintenance edge — see AGENTS.md. Pages CMS fields are
optional unless `.pages.yml` sets `required: true`; the content-schema test keeps
those flags aligned with Astro's required project fields.

This double-declaration applies to the **`projects` collection**. The
**singletons** (`src/content/singletons/*.md`: site, home, contact) have
**no Zod mirror** — they're declared only in `.pages.yml` and read straight from
their Markdown by the component that imports them. So for a singleton field, keep
`.pages.yml` and the consuming component in sync, and have that component tolerate
missing/empty values (the current ones already do).

Translatable fields come in `_cs`/`_en` pairs — when you add one, add **both**
halves in **both** schema places, and render them through `T.astro`/`Prose.astro`
so the language switch works. Language-neutral fields (images, `year`, `email`,
`phone`) stay single.

### Add or change translated UI text (not CMS content)

Baked-in labels (nav, section headings, "Back to work", etc.) live in
`src/i18n.ts` as a `{ cs, en }` dictionary. Add a key with both languages, then
render it with `<T k="yourKey" />` (or `<T as="h2" k="yourKey" class="…" />`).
For a bilingual string that comes from content rather than the dictionary, pass
explicit props: `<T cs={…} en={…} />`, or `<Prose cs={…} en={…} />` for rich text.
The language machinery (detection, the footer language toggle, `<title>` sync) lives
in `src/layouts/Base.astro`; how and why is in ARCHITECTURE.md →
"Internationalization".

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
   deploy). Pushes limited to `src/content/` and `public/uploads/` skip unit and
   browser tests; the production build still validates and publishes the
   content. Mixed content/code pushes and manual workflow runs execute the full
   test suite. No manual step.

## Content editing setup (Pages CMS)

Connect the repo once at [app.pagescms.org](https://app.pagescms.org) (sign in
with GitHub, grant the app access to the repo). It reads `.pages.yml`. No proxy
or server — this is why Pages CMS was chosen over Sveltia. See ARCHITECTURE.md.

---

## Known gaps / things to verify

- **Pages CMS behavior is untested end-to-end** (it's hosted; needs the live
  repo). After connecting, create one test project through the UI and confirm the
  committed file matches the shape of
  `src/content/projects/urban-study-kyjov.md`. Confirm that text-block
  `body_cs`/`body_en` fields are written into frontmatter as Markdown strings
  (the file's own Markdown body stays empty — `Prose.astro` renders those fields
  with `marked`, so the text must land in frontmatter, not the body).
  If this is off, it's a small `.pages.yml` tweak.
- **Placeholders to replace before launch:** the `.svg` files in
  `public/uploads/`, the sample projects, and the domain (see above). Contact
  details are placeholders in `src/content/singletons/contact.md`
  (`info@kalabkova.cz`, `+420 777 123 456`) and the owner name in `site.md` — all
  editable via the CMS. Site-wide text (name, credential, email, phone, hours) now
  comes from those singletons, not from hardcoded strings in components.

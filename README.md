# Architect Portfolio

The portfolio website of Ing. arch. Tereza Kalábková, live at
[kalabkova.cz](https://kalabkova.cz). Static, bilingual (Czech and English) and
image-forward. Czech pages use `/cs/…` and English pages `/en/…`; existing
unprefixed URLs automatically select a saved or browser language, falling back
to English. The footer links to the equivalent translated page.

Astro with one Svelte island and Tailwind, in TypeScript on Node 24, hosted on
GitHub Pages.

## Run it

```sh
nix develop      # provides Node and npm
npm install
npm run dev      # http://localhost:4321
```

Tests, build and other commands: [MAINTAINERS.md](MAINTAINERS.md).

## Content

Projects are Markdown files in `src/content/projects/`, the landing page's
images, the About page, the contacts in the footer and the site
settings are in `src/content/singletons/`, and images in `public/uploads/`.
Each project brief introduces the project and her involvement. Optional personal
roles summarize her responsibilities; collaborators credit other people. Project
classifications and realization describe the whole project. An optional project
thumbnail selects its card and share image; an empty field uses the first page
image. See [MAINTAINERS.md](MAINTAINERS.md)
for the editing fields.

The same content generates `/llms.txt`, a bilingual index of pages, and
`/llms-full.txt`, the full text and facts with passages labelled by language.

The owner edits all of it through [Pages CMS](https://pagescms.org): the repo is
connected at app.pagescms.org, which reads `.pages.yml` and commits straight to
`master` as `pages-cms[bot]`, so pull before you push.

For a full-width project image, add **Obrázek nebo prezentace na celou šířku**
under **Obsah stránky** and add one image. Multiple images in the same block
form a manual slideshow.

## Deploys

Every push to `master`, from the CMS or from code, runs
`.github/workflows/deploy.yml`: tests, build, deploy to GitHub Pages. A push
that only touches `src/content/` and `public/uploads/` skips the tests; the
build still validates the content. Manual runs of the workflow always run the
tests.

Under **Settings → Pages** the source is GitHub Actions and the custom domain is
the one in `public/CNAME`; its DNS points at GitHub Pages.

## Docs

- [MAINTAINERS.md](MAINTAINERS.md) — commands, file layout, common changes
- [FEATURES.md](FEATURES.md) — product decisions
- [ARCHITECTURE.md](ARCHITECTURE.md) — technical decisions
- [AGENTS.md](AGENTS.md) — keeping the docs true, invariants to protect

## License

The code is under the [MIT License](LICENSE). The content in `src/content/` and
`public/uploads/` (texts, drawings, visualisations, photographs) is © Tereza
Kalábková and the respective authors, all rights reserved, and is not covered by
the MIT License.

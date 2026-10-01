# Architect Portfolio

The portfolio website of Ing. arch. Tereza Kalábková, live at
[kalabkova.cz](https://kalabkova.cz). Static, bilingual (Czech and English) and
image-forward.

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

Projects are Markdown files in `src/content/projects/`, the home, contact and
site settings are in `src/content/singletons/`, and images in `public/uploads/`.

The owner edits all of it through [Pages CMS](https://pagescms.org): the repo is
connected at app.pagescms.org, which reads `.pages.yml` and commits straight to
`master` as `pages-cms[bot]`, so pull before you push.

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

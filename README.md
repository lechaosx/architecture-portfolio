# Architect Portfolio

A fast, clean portfolio website for an architect. Static, image-forward, and
editable in the browser — no coding needed for day-to-day content.

Built with Astro + Svelte + Tailwind, hosted on GitHub Pages with a custom
domain. Content is managed through [Pages CMS](https://pagescms.org).

- **Why it behaves the way it does:** [FEATURES.md](FEATURES.md)
- **Working on the code?** [MAINTAINERS.md](MAINTAINERS.md) and
  [ARCHITECTURE.md](ARCHITECTURE.md)

---

## For the site owner

### How do I edit content?

You edit at **[app.pagescms.org](https://app.pagescms.org)** — a friendly editor
in your browser. Nothing to install.

1. Go to app.pagescms.org and sign in with GitHub.
2. Open this project (a one-time access grant lets it read the repo).
3. Edit **Projects** or the **About page** using simple forms.
4. Click save. The site rebuilds and updates on its own in a couple of minutes.

**Adding a project:** Projects → new → fill in title, year, location, upload a
cover image and gallery photos, write a description, save.

**Hiding a project:** turn on its **Draft** switch — it stays in the system but
disappears from the public site until you turn it off.

**Reordering projects:** set each project's **Sort order** number (lower shows
first).

### How do I change the logo name, email, or wording?

Small text like the architect's name and contact email currently lives in the code.
Ask your developer, or see [MAINTAINERS.md](MAINTAINERS.md).

### What do visitors get?

- A home page with your projects in a grid.
- A page per project with a description and a full-screen photo gallery.
- An About page.
- Smooth transitions between pages and gentle fade-ins — all riding the normal
  scrollbar (no janky scroll effects). Fast to load, works on phones.

---

## Going live (one-time checklist)

Mostly a developer task; kept here so the owner knows what "done" looks like.

1. Push the code to a GitHub repository.
2. Repo **Settings → Pages → Source = GitHub Actions**.
3. Add your custom **domain** under Settings → Pages and point its DNS at GitHub
   Pages. Set the same domain in `public/CNAME` and in `astro.config.mjs`.
4. Connect the repo at [app.pagescms.org](https://app.pagescms.org) so content
   editing works.
5. Replace the placeholder images in `public/uploads/` and the sample projects
   with real content.

After this, every saved edit (yours via the CMS, or the developer's in code)
publishes automatically.

---

## Running it locally (developers)

```sh
nix develop      # provides bun
bun install
bun dev          # http://localhost:4321
```

Full developer documentation: [MAINTAINERS.md](MAINTAINERS.md).

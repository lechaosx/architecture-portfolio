# Architect Portfolio

A fast, clean portfolio website for an architect. Static, image-forward, and
editable in the browser — no coding needed for day-to-day content.

Built with Astro + Svelte + Tailwind, hosted on GitHub Pages at a custom domain.
Content is managed through [Pages CMS](https://pagescms.org).

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
3. Edit any entry with simple forms — **Home page** (carousel images, your bio +
   portrait, and your approach), **Projects**, **Contact**, or **Site settings**
   (your name, credential, and search-engine description).
4. Click save. The site rebuilds and updates on its own in a couple of minutes.

**Adding a project:** Projects → new → fill in title, year, location, upload a
cover image and gallery photos, write a description, save.

**Hiding a project:** turn on its **Draft** switch — it stays in the system but
disappears from the public site until you turn it off.

**Project order:** projects sort automatically — newest year first, then A–Z by
title within the same year. Nothing to set.

### How do I change my name, email, phone, or hours?

All editable in the CMS: your **name** and **credential** live in **Site
settings**; your **email**, **phone**, and day-by-day **availability** live in
**Contact**. Fixed section labels like "Work" and "Approach" live in the code —
ask your developer to change those (see [MAINTAINERS.md](MAINTAINERS.md)).

### What do visitors get?

- A home page that's your "about": an image carousel, your bio, and your approach.
  (The carousel images, bio, portrait, and approach are all editable in the CMS.)
- A **Work** page with your projects in a grid.
- A page per project with a description and a full-screen photo gallery.
- A **Contact** page with your email, phone, and when you're reachable.
- Smooth transitions between pages and gentle fade-ins — all riding the normal
  scrollbar (no janky scroll effects). Fast to load, works on phones.

---

## Going live (one-time checklist)

Mostly a developer task; kept here so the owner knows what "done" looks like.

1. Push the code to a GitHub repository.
2. Repo **Settings → Pages → Source = GitHub Actions**.
3. The site serves from a custom **domain** (`public/CNAME`): add the same domain
   under Settings → Pages, and point its DNS at GitHub Pages.
4. Connect the repo at [app.pagescms.org](https://app.pagescms.org) so content
   editing works.
5. Replace the placeholder content: the images in `public/uploads/`, the sample
   projects, and your real details in **Contact** (email/phone/hours) and **Site
   settings** (name).

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

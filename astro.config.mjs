import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Deployment targets are declared in deploy.config.json (in-repo, declarative).
// Switch targets by changing its "active" field — no code edits, no CI logic.
// Per target:
//   base   REQUIRED. Path the site is mounted at ("/" or "/repo"). This is the
//          only setting needed for the site to work at a given URL; every
//          internal link/asset flows through withBase() (src/lib/url.ts).
//   site   OPTIONAL. Full origin. Used ONLY to build absolute URLs for the
//          sitemap (SEO). Omit it and the sitemap is simply skipped.
//   cname  OPTIONAL. Written to dist/CNAME at build (for custom-domain targets).
const deploy = JSON.parse(
  readFileSync(new URL('./deploy.config.json', import.meta.url), 'utf8'),
);
const target = deploy.targets[deploy.active];
if (!target) {
  throw new Error(`deploy.config.json: unknown active target "${deploy.active}"`);
}

/** Emit dist/CNAME for custom-domain targets, straight from the config. */
const emitCname = {
  name: 'emit-cname',
  hooks: {
    'astro:build:done': ({ dir }) => {
      if (target.cname) writeFileSync(new URL('CNAME', dir), `${target.cname}\n`);
    },
  },
};

export default defineConfig({
  site: target.site,
  base: target.base ?? '/',
  integrations: [svelte(), sitemap(), emitCname],
  vite: {
    plugins: [tailwindcss()],
  },
});

import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Deployment is declared in deploy.config.json (in-repo, declarative). Switch
// targets by changing its "active" field — no code edits, no CI logic.
//   site           Single canonical origin, used ONLY for the sitemap's absolute
//                  URLs (SEO). Meaningful only on the canonical deployment; on
//                  other targets the sitemap is irrelevant, so one value is fine.
//   targets[x].base   REQUIRED. Path the site is mounted at ("/" or "/repo").
//                     The only setting needed for the site to work at a URL;
//                     every internal link/asset flows through withBase().
//   targets[x].cname  OPTIONAL. Written to dist/CNAME (for custom-domain targets).
const deploy = JSON.parse(
  readFileSync(new URL('./deploy.config.json', import.meta.url), 'utf8'),
);
const target = deploy.targets[deploy.active];
if (!target) {
  throw new Error(`deploy.config.json: unknown active target "${deploy.active}"`);
}

// `astro dev` always serves from the root for convenience; builds use the
// active target's base. (withBase() adapts links/assets to whichever is active.)
const isDev = process.argv.includes('dev');

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
  site: deploy.site,
  base: isDev ? '/' : (target.base ?? '/'),
  integrations: [svelte(), sitemap(), emitCname],
  vite: {
    plugins: [tailwindcss()],
  },
});

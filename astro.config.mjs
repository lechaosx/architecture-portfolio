import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// TODO: replace with the real custom domain (used for canonical URLs + sitemap).
// Must match public/CNAME. No `base` needed — a custom domain serves from root.
const SITE = 'https://example.com';

export default defineConfig({
  site: SITE,
  integrations: [svelte(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});

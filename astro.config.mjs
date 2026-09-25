import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// The site is served from the root of a single custom domain, so there is no
// `base` to configure and internal links are plain root-absolute paths.
// `site` is the canonical origin — its only consumer is the sitemap (SEO).
// The custom domain is committed as public/CNAME.
export default defineConfig({
  site: 'https://kalabkova.cz',
  integrations: [svelte(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // direnv links the flake's nixpkgs source into .direnv/flake-inputs, and
    // watching through that link keeps a file open for each of its ~127k files.
    server: { watch: { ignored: ['**/.direnv/**'] } },
  },
});

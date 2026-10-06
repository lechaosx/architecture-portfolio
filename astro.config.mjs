import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// The site is served from the root of a single custom domain, so there is no
// `base` to configure and internal links are plain root-absolute paths.
// `site` is the canonical origin of every absolute URL the build writes.
// The custom domain is committed as public/CNAME.
export default defineConfig({
  site: 'https://kalabkova.cz',
  trailingSlash: 'always',
  integrations: [
    svelte(),
    // / only forwards to /work/.
    sitemap({ filter: (page) => new URL(page).pathname !== '/' }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // direnv links the flake's nixpkgs source into .direnv/flake-inputs, and
    // watching through that link keeps a file open for each of its ~127k files.
    server: { watch: { ignored: ['**/.direnv/**'] } },
  },
});

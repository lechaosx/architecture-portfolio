import { mergeConfig } from 'astro/config';
import config from './astro.config.mjs';

// The browser tests' build: the site plus their own pages at /e2e/, kept out
// of dist/ so it never stands in for the deployed site.
export default mergeConfig(config, {
  outDir: './dist-e2e',
  integrations: [
    {
      name: 'e2e-pages',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          injectRoute({
            pattern: '/e2e/[fixture]',
            entrypoint: './tests/e2e/pages/[fixture].astro',
          });
          injectRoute({
            pattern: '/e2e/images/[file]',
            entrypoint: './tests/e2e/pages/images/[file].ts',
          });
        },
      },
    },
  ],
});

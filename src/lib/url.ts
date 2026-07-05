// Base-aware URL helpers so the same build's links/assets resolve whether the
// site is served under a GitHub Pages project subpath (/<repo>/) or at the root
// of a custom domain (/). BASE_URL comes from `base` in astro.config.mjs; it may
// or may not carry a trailing slash, so join carefully.
const BASE = import.meta.env.BASE_URL;

/** Prefix a site-absolute path (e.g. "/about", "/uploads/x.svg") with the base. */
export function withBase(path: string): string {
  const base = BASE.replace(/\/+$/, ''); // "" for a root deploy, "/<repo>" for a project subpath
  const rel = path.replace(/^\/+/, '');
  return `${base}/${rel}`;
}

/**
 * Normalize a request pathname to a base-less, trailing-slash-free path
 * ("/" for the home page). Robust whether or not `pathname` includes the base.
 */
export function stripBase(pathname: string): string {
  const base = BASE.replace(/\/+$/, '');
  let p = pathname;
  if (base && p.startsWith(base)) p = p.slice(base.length);
  p = p.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

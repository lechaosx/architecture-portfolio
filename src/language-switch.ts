import { localizedPath, neutralPath, routeLanguage } from './locale';
import type { Lang } from './i18n';

export function initLanguageSwitch() {
  const root = document.documentElement;

  function links(lang: Lang) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (link.closest('astro-island')) continue;
      const url = new URL(link.href);
      if (url.origin !== location.origin) continue;
      if (link.hasAttribute('data-lang-toggle')) {
        const other = lang === 'cs' ? 'en' : 'cs';
        link.href = localizedPath(location.pathname + location.search + location.hash, other);
        link.hreflang = other;
      } else if (routeLanguage(url.pathname) || link.hasAttribute('data-localized-path')) {
        link.href = localizedPath(url.pathname + url.search + url.hash, lang);
      }
    }
  }

  function translate(lang: Lang) {
    if (root.dataset.lang !== lang) {
      for (const element of document.querySelectorAll<HTMLElement>('[data-translation-cs]')) {
        const text = element.getAttribute(`data-translation-${lang}`)!;
        element.lang = lang;
        if (element.hasAttribute('data-translation-html')) element.innerHTML = text;
        else if (element.hasAttribute('data-translation-paragraphs')) {
          element.replaceChildren(...text.split(/\s*\n\s*/).map((paragraph) => {
            const p = document.createElement('p');
            p.textContent = paragraph;
            return p;
          }));
        } else element.textContent = text;
        if (element.hasAttribute('data-translation-optional')) element.hidden = !text.trim();
        if (element.hasAttribute('data-columns-cs')) {
          element.classList.toggle('prose-columns', element.getAttribute(`data-columns-${lang}`) === 'true');
        }
      }
      for (const image of document.querySelectorAll<HTMLImageElement>('[data-alt-cs]')) {
        image.alt = image.getAttribute(`data-alt-${lang}`)!;
      }
      for (const meta of document.querySelectorAll<HTMLMetaElement>('head meta[data-cs]')) {
        if (meta.name === 'page-title') document.title = meta.dataset[lang]!;
        else meta.content = meta.dataset[lang]!;
      }
      const graph = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
      if (graph?.dataset[lang]) graph.textContent = graph.dataset[lang]!;
      root.lang = lang;
      root.dataset.lang = lang;
      document.dispatchEvent(new Event('site:language'));
    }
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = new URL(localizedPath(new URL(canonical.href).pathname, lang), canonical.href).href;
    const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogUrl && canonical) ogUrl.content = canonical.href;
    links(lang);
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-lang-toggle]');
    if (!link) return;
    const url = new URL(link.href);
    const targetLanguage = routeLanguage(url.pathname);
    if (!targetLanguage) return;
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || link.target && link.target !== '_self' || link.hasAttribute('download') || url.origin !== location.origin
      || neutralPath(url.pathname) !== neutralPath(location.pathname)) return;
    const lang = root.dataset.lang === 'cs' ? 'en' : 'cs';
    url.pathname = localizedPath(url.pathname, lang);
    try { localStorage.setItem('lang', lang); } catch {}
    event.preventDefault();
    const top = link.getBoundingClientRect().top;
    const viewer = Boolean(link.closest('[data-gallery-lightbox]'));
    if (viewer) history.replaceState(history.state, '', url);
    else history.pushState(history.state, '', url);
    translate(lang);
    if (!viewer) window.scrollBy({ top: link.getBoundingClientRect().top - top, behavior: 'instant' });
  });

  addEventListener('popstate', () => {
    // The gallery rebases its closed entry during the same browser event.
    // A task runs after all native and Svelte popstate listeners finish.
    setTimeout(() => {
      const lang = routeLanguage(location.pathname);
      if (lang) translate(lang);
    }, 0);
  });
  const refreshLinks = () => links(root.dataset.lang === 'cs' ? 'cs' : 'en');
  addEventListener('hashchange', refreshLinks);
  addEventListener('pageshow', refreshLinks);
  refreshLinks();
}

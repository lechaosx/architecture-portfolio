import type { Lang } from './i18n';

export const routeLanguage = (path: string): Lang | undefined =>
  path.match(/^\/(cs|en)(?:\/|$)/)?.[1] as Lang | undefined;
export const neutralPath = (path: string) => path.replace(/^\/(?:cs|en)(?=\/|$)/, '') || '/';
export const localizedPath = (path: string, lang: Lang) => `/${lang}${neutralPath(path)}`;

export const pageLanguage = (path: string): Lang => routeLanguage(path) ?? 'en';

export function preferredLanguage(saved: string | null, languages: readonly string[]): Lang {
  if (saved === 'cs' || saved === 'en') return saved;
  for (const preference of languages) {
    const language = preference.toLowerCase().split('-')[0];
    if (language === 'cs' || language === 'en') return language;
  }
  return 'en';
}

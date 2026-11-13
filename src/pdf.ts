import type { Lang } from './i18n';

// Plain ASCII, so the address needs no percent-encoding and the downloaded
// file names the person legibly.
export function pdfPath(name: string, kind: 'cv' | 'portfolio', lang: Lang) {
  const person = name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `/${[person, kind, lang].filter(Boolean).join('-')}.pdf`;
}

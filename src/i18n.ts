// Baked-in UI strings (section labels, nav, etc.) in both languages. Editable
// CONTENT lives in the CMS singletons/projects; these are the fixed scaffolding
// labels — see FEATURES.md "Dual language (Czech + English)".
export const LANGS = ['cs', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const ui = {
  cs: {
    workNav: 'Práce',
    contactNav: 'Kontakt',
    about: 'O mně',
    approach: 'Přístup',
    work: 'Práce',
    contact: 'Kontakt',
    whenToReach: 'Kdy mě zastihnete',
    email: 'E-mail',
    phone: 'Telefon',
    backToWork: '← Zpět na práce',
    tagline: 'Architektura',
  },
  en: {
    workNav: 'Work',
    contactNav: 'Contact',
    about: 'About',
    approach: 'Approach',
    work: 'Work',
    contact: 'Contact',
    whenToReach: 'When to reach me',
    email: 'Email',
    phone: 'Phone',
    backToWork: '← Back to work',
    tagline: 'Architecture',
  },
} satisfies Record<Lang, Record<string, string>>;

export type UiKey = keyof typeof ui.cs;

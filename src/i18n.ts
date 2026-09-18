// Baked-in UI strings (section labels, nav, etc.) in both languages. Editable
// CONTENT lives in the CMS singletons/projects; these are the fixed scaffolding
// labels — see FEATURES.md "Dual language (Czech + English)".
export type Lang = 'cs' | 'en';

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
    close: 'Zavřít',
    goToImage: 'Přejít na obrázek',
    imageViewer: 'Prohlížeč obrázků',
    nextImage: 'Další obrázek',
    openImage: 'Otevřít obrázek',
    openOriginal: 'Otevřít originál',
    positionOf: 'z',
    previousImage: 'Předchozí obrázek',
    resetZoom: 'Obnovit přiblížení',
    selectedWork: 'Vybrané práce',
    tagline: 'Architektura',
    switchLanguage: 'Přepnout do angličtiny',
    switchTheme: 'Přepnout motiv',
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
    close: 'Close',
    goToImage: 'Go to image',
    imageViewer: 'Image viewer',
    nextImage: 'Next image',
    openImage: 'Open image',
    openOriginal: 'Open original',
    positionOf: 'of',
    previousImage: 'Previous image',
    resetZoom: 'Reset zoom',
    selectedWork: 'Selected work',
    tagline: 'Architecture',
    switchLanguage: 'Switch to Czech',
    switchTheme: 'Toggle theme',
  },
} satisfies Record<Lang, Record<string, string>>;

export type UiKey = keyof typeof ui.cs;

// Baked-in UI strings (section labels, nav, etc.) in both languages. Editable
// CONTENT lives in the CMS singletons/projects; these are the fixed scaffolding
// labels — see FEATURES.md "Dual language (Czech + English)".
export type Lang = 'cs' | 'en';

export const ui = {
  cs: {
    about: 'O mně',
    approach: 'Přístup',
    experience: 'Praxe',
    services: 'Služby',
    education: 'Vzdělání',
    awards: 'Ocenění',
    work: 'Práce',
    contact: 'Kontakt',
    email: 'E-mail',
    phone: 'Telefon',
    location: 'Místo',
    toAbout: 'O mně →',
    selectedWork: 'Vybrané práce',
    allWork: 'Všechny práce →',
    backToWork: '← Zpět na práce',
    close: 'Zavřít',
    description: 'Popis',
    goToImage: 'Přejít na obrázek',
    image: 'Obrázek',
    imageSet: 'Obrázky v sadě',
    imageViewer: 'Prohlížeč obrázků',
    nextImage: 'Další obrázek',
    openImage: 'Otevřít obrázek',
    openOriginal: 'Otevřít originál',
    positionOf: 'z',
    previousImage: 'Předchozí obrázek',
    showDescription: 'Zobrazit popis',
    tagline: 'Architektka',
    switchLanguage: 'Přepnout do angličtiny',
    switchTheme: 'Přepnout motiv',
    notFound: 'Stránka nenalezena',
    notFoundHeading: 'Na této parcele nic nestojí.',
    notFoundLine: 'Určitě jste na správné adrese?',
    notFoundLink: 'Zpátky do ateliéru',
  },
  en: {
    about: 'About',
    approach: 'Approach',
    experience: 'Experience',
    services: 'Services',
    education: 'Education',
    awards: 'Awards',
    work: 'Work',
    contact: 'Contact',
    email: 'Email',
    phone: 'Phone',
    location: 'Location',
    toAbout: 'About →',
    selectedWork: 'Selected work',
    allWork: 'All work →',
    backToWork: '← Back to work',
    close: 'Close',
    description: 'Description',
    goToImage: 'Go to image',
    image: 'Image',
    imageSet: 'Images in this set',
    imageViewer: 'Image viewer',
    nextImage: 'Next image',
    openImage: 'Open image',
    openOriginal: 'Open original',
    positionOf: 'of',
    previousImage: 'Previous image',
    showDescription: 'Show description',
    tagline: 'Architect',
    switchLanguage: 'Switch to Czech',
    switchTheme: 'Toggle theme',
    notFound: 'Page not found',
    notFoundHeading: 'Nothing stands on this plot.',
    notFoundLine: 'Are you sure you have the right address?',
    notFoundLink: 'Back to the studio',
  },
} satisfies Record<Lang, Record<string, string>>;

export type UiKey = keyof typeof ui.cs;

/**
 * The one language a pair of texts is filled in, or undefined when both are.
 * An element carrying it is hidden by the language switch in the other
 * language, so a line filled in one language never shows empty in the other.
 */
export const onlyIn = (cs?: string, en?: string): Lang | undefined =>
  cs && en ? undefined : cs ? 'cs' : 'en';

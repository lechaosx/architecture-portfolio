// The site settings, About data, contacts and CV of fixture pages that bring
// none of their own. The English call hours are much longer than the Czech, so
// translating them changes whether the contact line fits the footer.
export const site = {
  name: 'Klára Svobodová',
  credential: 'Ing. arch.',
  description: {
    cs: 'Portfolio Ing. arch. Kláry Svobodové, architektky.',
    en: 'Portfolio of Ing. arch. Klára Svobodová, architect.',
  },
};

export const about = {
  bio: { cs: 'Architektka.', en: 'Architect.' },
  approaches: [],
  experience: [],
  services: [],
  education: [],
  awards: [],
};

export const contact = {
  email: 'studio@example.cz',
  phone: '+420 777 000 000',
  location: { cs: 'Brno', en: 'Brno' },
  hours: { cs: 'Po–Pá 9–17', en: 'Weekdays 9 am to 5 pm' },
  ico: '12345678',
  seat: 'Na Poříčí 1041/12, 110 00 Praha 1 – Nové Město',
};

export const cv = {
  profile: { cs: 'Architektka z Brna.', en: 'An architect in Brno.' },
  interests: [],
  links: [{ label: 'linkedin.com/in/klara-svobodova', url: 'https://www.linkedin.com/in/klara-svobodova' }],
  exhibitions: [],
};

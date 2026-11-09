import { getEntry } from 'astro:content';
import { periodIssues } from './period';
import { fileExists } from './server-images';

function data<T>(entry: { data: T } | undefined, name: string) {
  if (!entry) throw new Error(`Missing src/content/singletons/${name}.md`);
  return entry.data;
}

const landingData = data(await getEntry('landing', 'landing'), 'landing');
const aboutData = data(await getEntry('about', 'about'), 'about');

// The CMS cannot compare a period's ends, so a wrong period is shown as typed
// and only reported here.
for (const list of ['experience', 'education', 'awards'] as const) {
  aboutData[list].forEach((row, index) => {
    for (const { field, message } of periodIssues(row)) {
      console.warn(`src/content/singletons/about.md: ${list}[${index}].${field}: ${message}`);
    }
  });
}

export const site = data(await getEntry('site', 'site'), 'site');
// Images whose file is missing are left out, as if never added.
export const landing = { ...landingData, images: landingData.images.filter(fileExists) };
export const about = {
  ...aboutData,
  portrait: aboutData.portrait && fileExists(aboutData.portrait) ? aboutData.portrait : undefined,
};
export const contact = data(await getEntry('contact', 'contact'), 'contact');

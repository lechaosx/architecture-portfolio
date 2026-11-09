import { getEntry } from 'astro:content';
import { periodIssues } from './period';
import { chosenCards } from './projects';
import { projects } from './published-projects';
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

const chosen = chosenCards(landingData.projects, projects);
for (const { index, message } of chosen.issues) {
  console.warn(`src/content/singletons/landing.md: projects[${index}]: ${message}`);
}

// Images whose file is missing are left out, as if never added, and reported.
function found(path: string, location: string) {
  const there = fileExists(path);
  if (!there) console.warn(`${location}: ${path} no longer exists`);
  return there;
}

export const site = data(await getEntry('site', 'site'), 'site');
export const landing = {
  images: landingData.images.filter((image, index) => found(image, `src/content/singletons/landing.md: images[${index}]`)),
  projects: chosen.cards,
};
export const about = {
  ...aboutData,
  portrait: aboutData.portrait && found(aboutData.portrait, 'src/content/singletons/about.md: portrait') ? aboutData.portrait : undefined,
};
export const contact = data(await getEntry('contact', 'contact'), 'contact');

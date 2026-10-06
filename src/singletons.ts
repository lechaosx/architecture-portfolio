import { getEntry } from 'astro:content';

function data<T>(entry: { data: T } | undefined, name: string) {
  if (!entry) throw new Error(`Missing src/content/singletons/${name}.md`);
  return entry.data;
}

export const site = data(await getEntry('site', 'site'), 'site');
export const about = data(await getEntry('about', 'about'), 'about');
export const contact = data(await getEntry('contact', 'contact'), 'contact');

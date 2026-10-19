import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { llmsFullTxt } from '../llms-txt';
import { about, contact, site } from '../singletons';
import { credentialedName } from '../site-title';

export const GET: APIRoute = async ({ site: origin }) =>
  new Response(
    llmsFullTxt({
      site: new URL('/', origin),
      name: credentialedName,
      description: { cs: site.description_cs, en: site.description_en },
      about,
      contact,
      projects: await getCollection('projects', ({ data }) => !data.draft),
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );

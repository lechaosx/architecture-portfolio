import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { llmsTxt } from '../llms-txt';
import { contact, home, site } from '../singletons';
import { credentialedName } from '../site-title';

export const GET: APIRoute = async ({ site: origin }) =>
  new Response(
    llmsTxt({
      site: new URL('/', origin),
      name: credentialedName,
      description: { cs: site.description_cs, en: site.description_en },
      home,
      contact,
      projects: await getCollection('projects', ({ data }) => !data.draft),
    }),
  );

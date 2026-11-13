import type { APIRoute } from 'astro';
import { llmsTxt } from '../llms-txt';
import { contact, site } from '../singletons';
import { credentialedName } from '../site-title';
import { projects } from '../published-projects';

export const GET: APIRoute = async ({ site: origin }) =>
  new Response(
    llmsTxt({
      site: new URL('/', origin),
      name: credentialedName(site),
      description: site.description,
      contact,
      projects,
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );

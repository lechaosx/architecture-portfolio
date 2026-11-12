import type { APIRoute } from 'astro';
import { llmsFullTxt, llmsTxt } from '../../../src/llms-txt';
import { credentialedName } from '../../../src/site-title';
import { about, contact, site } from '../architect';
import { thumbnailProjects } from '../thumbnail-projects';

// The AI exports of the thumbnail fixtures, whose project pages exist.
export const getStaticPaths = () => ['llms', 'llms-full'].map((file) => ({ params: { file } }));

export const GET: APIRoute = ({ params, site: origin }) => {
  const data = { site: new URL('/', origin), name: credentialedName(site), description: site.description, projects: thumbnailProjects };
  return new Response(
    params.file === 'llms' ? llmsTxt(data) : llmsFullTxt({ ...data, about, contact }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};

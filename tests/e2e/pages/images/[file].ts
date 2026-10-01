import { readdir, readFile } from 'node:fs/promises';
import type { APIRoute } from 'astro';

// The images of the pages in ../[fixture].astro.
const directory = 'tests/e2e/images';

export async function getStaticPaths() {
  return (await readdir(directory)).map((file) => ({ params: { file } }));
}

export const GET: APIRoute = async ({ params }) =>
  new Response(await readFile(`${directory}/${params.file}`));

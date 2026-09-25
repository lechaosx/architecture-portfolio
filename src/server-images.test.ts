import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getResponsiveImage } from './server-images';

const originalDirectory = process.cwd();
let root: string;

async function writeManifest(url: string, modified: Date) {
  const path = join(root, 'public/_responsive/manifest.json');
  const image = {
    originalUrl: '/uploads/plan.png',
    source: { url, width: 1, height: 1, bytes: 1, format: 'png' },
    variants: [],
  };
  await writeFile(
    path,
    JSON.stringify({ version: 3, images: { '/uploads/plan.png': image } }),
  );
  await utimes(path, modified, modified);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'server-images-'));
  await mkdir(join(root, 'public/_responsive'), { recursive: true });
  process.chdir(root);
});

afterAll(async () => {
  process.chdir(originalDirectory);
  await rm(root, { recursive: true, force: true });
});

test('serves the regenerated manifest once the file changes', async () => {
  await writeManifest('/_responsive/old/source.png', new Date(1_000_000));
  expect((await getResponsiveImage('/uploads/plan.png'))?.source.url).toBe(
    '/_responsive/old/source.png',
  );

  await writeManifest('/_responsive/new/source.png', new Date(2_000_000));
  expect((await getResponsiveImage('/uploads/plan.png'))?.source.url).toBe(
    '/_responsive/new/source.png',
  );
});

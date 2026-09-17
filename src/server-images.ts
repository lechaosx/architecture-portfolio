import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ImageManifest } from './images';

let manifest: Promise<ImageManifest> | undefined;

function imageManifest() {
  manifest ??= readFile(resolve('public/_responsive/manifest.json'), 'utf8').then(
    (content) => JSON.parse(content) as ImageManifest,
  );
  return manifest;
}

export async function getResponsiveImage(src: string) {
  return (await imageManifest()).images[src];
}

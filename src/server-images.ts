import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ImageManifest } from './images';

// Keyed on the file's modification time: a long-running dev server picks up a
// regenerated manifest instead of emitting URLs whose files have been removed.
let cached: { modified: number; manifest: Promise<ImageManifest> } | undefined;

async function imageManifest() {
  const path = resolve('public/_responsive/manifest.json');
  const modified = (await stat(path)).mtimeMs;
  if (cached?.modified !== modified) {
    cached = {
      modified,
      manifest: readFile(path, 'utf8').then(
        (content) => JSON.parse(content) as ImageManifest,
      ),
    };
  }
  return cached.manifest;
}

export async function getResponsiveImage(src: string) {
  return (await imageManifest()).images[src];
}

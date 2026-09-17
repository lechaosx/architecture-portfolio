import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { GENERATED_IMAGE_WIDTHS } from '../src/images';
import { imageCacheKey } from './image-cache';

const sourceDirectory = resolve('public/uploads');
const contentDirectory = resolve('src/content');
const outputDirectory = resolve('public/_responsive');
const cacheDirectory = resolve('node_modules/.astro/images');
const uploadReference = /\/uploads\/(.+?\.(?:avif|jpe?g|png|webp))/gi;
const recipe = {
  version: 1,
  widths: GENERATED_IMAGE_WIDTHS,
  gamma: 2.2,
  kernel: sharp.kernel.lanczos3,
  format: 'webp',
  lossless: true,
  effort: 4,
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
};

async function filePaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filePaths(path) : [path];
    }),
  );
  return paths.flat();
}

async function referencedImages() {
  const paths = new Set<string>();

  for (const contentPath of await filePaths(contentDirectory)) {
    const content = await readFile(contentPath, 'utf8');
    for (const match of content.matchAll(uploadReference)) {
      const sourcePath = resolve(sourceDirectory, match[1]);
      if (sourcePath.startsWith(`${sourceDirectory}${sep}`)) paths.add(sourcePath);
    }
  }

  return [...paths];
}

await rm(outputDirectory, { recursive: true, force: true });

let generated = 0;
let reused = 0;

for (const sourcePath of await referencedImages()) {
  const relativePath = relative(sourceDirectory, sourcePath);
  const cacheKey = imageCacheKey(await readFile(sourcePath), recipe);

  for (const width of GENERATED_IMAGE_WIDTHS) {
    const outputPath = join(outputDirectory, `${relativePath}.${width}.webp`);
    const cachePath = join(cacheDirectory, cacheKey, `${width}.webp`);
    await mkdir(dirname(outputPath), { recursive: true });

    try {
      await access(cachePath);
      reused += 1;
    } catch {
      await mkdir(dirname(cachePath), { recursive: true });
      await sharp(sourcePath, { limitInputPixels: false })
        .gamma(recipe.gamma)
        .resize({ width, kernel: recipe.kernel })
        .webp({ lossless: recipe.lossless, effort: recipe.effort })
        .toFile(cachePath);
      generated += 1;
    }

    await copyFile(cachePath, outputPath);
  }
}

console.log(
  `Responsive images: ${generated} generated, ${reused} reused from cache.`,
);

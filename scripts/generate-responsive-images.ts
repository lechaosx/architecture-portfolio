import {
  access,
  cp,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { GENERATED_IMAGE_WIDTHS } from '../src/images';
import type { ImageManifest, ImageVariant } from '../src/images';
import {
  derivativeWidths,
  imageCacheKey,
  shouldGenerateDeepZoom,
  shouldPublishDerivative,
  webpPolicy,
} from './image-cache';

const sourceDirectory = resolve('public/uploads');
const contentDirectory = resolve('src/content');
const outputDirectory = resolve('public/_responsive');
const cacheDirectory = resolve('node_modules/.astro/images');
const uploadReference = /\/uploads\/(.+?\.(?:avif|jpe?g|png|webp))/gi;
const recipe = {
  version: 2,
  widths: GENERATED_IMAGE_WIDTHS,
  gamma: 2.2,
  kernel: sharp.kernel.lanczos3,
  format: 'webp',
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
};
const deepZoomRecipe = {
  version: 1,
  minimumLongestSide: 4096,
  gamma: 2.2,
  tileSize: 512,
  overlap: 1,
  layout: 'dz' as const,
  format: 'webp',
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

  return [...paths].sort();
}

await rm(outputDirectory, { recursive: true, force: true });

let generated = 0;
let reused = 0;
let omitted = 0;
let pyramidsGenerated = 0;
let pyramidsReused = 0;
const manifest: ImageManifest = { version: 2, images: {} };

for (const sourcePath of await referencedImages()) {
  const relativePath = relative(sourceDirectory, sourcePath);
  const source = await readFile(sourcePath);
  const sourceMetadata = await sharp(sourcePath, {
    limitInputPixels: false,
  }).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height || !sourceMetadata.format) {
    throw new Error(`Could not read image metadata: ${sourcePath}`);
  }
  const sourceDimensions = sourceMetadata.autoOrient ?? sourceMetadata;
  const output = webpPolicy(
    sourceMetadata.format,
    Boolean(sourceMetadata.hasAlpha),
  );
  const cacheKey = imageCacheKey(source, { ...recipe, output });
  const sourceUrl = `/uploads/${relativePath
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
  const variants: ImageVariant[] = [];

  for (const width of derivativeWidths(
    sourceDimensions.width,
    GENERATED_IMAGE_WIDTHS,
  )) {
    const outputPath = join(outputDirectory, cacheKey, `${width}.webp`);
    const cachePath = join(cacheDirectory, cacheKey, `${width}.webp`);
    let variant: ImageVariant;

    try {
      await access(cachePath);
      const [metadata, file] = await Promise.all([
        sharp(cachePath).metadata(),
        stat(cachePath),
      ]);
      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error(`Could not read cached image metadata: ${cachePath}`);
      }
      variant = {
        url: `/_responsive/${cacheKey}/${width}.webp`,
        width: metadata.width,
        height: metadata.height,
        bytes: file.size,
        format: metadata.format,
      };
      reused += 1;
    } catch {
      await mkdir(dirname(cachePath), { recursive: true });
      const result = await sharp(sourcePath, { limitInputPixels: false })
        .autoOrient()
        .gamma(recipe.gamma)
        .resize({ width, kernel: recipe.kernel })
        .webp(output)
        .toFile(cachePath);
      variant = {
        url: `/_responsive/${cacheKey}/${width}.webp`,
        width: result.width,
        height: result.height,
        bytes: result.size,
        format: result.format,
      };
      generated += 1;
    }

    if (!shouldPublishDerivative(source.byteLength, variant.bytes)) {
      omitted += 1;
      continue;
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(cachePath, outputPath);
    variants.push(variant);
  }

  let deepZoom: ResponsiveImage['deepZoom'];
  if (
    shouldGenerateDeepZoom(sourceDimensions.width, sourceDimensions.height)
  ) {
    const deepZoomCacheKey = imageCacheKey(source, {
      ...deepZoomRecipe,
      output,
    });
    const deepZoomCacheDirectory = join(cacheDirectory, deepZoomCacheKey);
    const deepZoomCachePath = join(deepZoomCacheDirectory, 'image.dzi');
    const deepZoomTargetPath = join(deepZoomCacheDirectory, 'image.dz');
    const deepZoomOutputDirectory = join(outputDirectory, deepZoomCacheKey);

    try {
      await access(deepZoomCachePath);
      pyramidsReused += 1;
    } catch {
      await rm(deepZoomCacheDirectory, { recursive: true, force: true });
      await mkdir(deepZoomCacheDirectory, { recursive: true });
      await sharp(sourcePath, { limitInputPixels: false })
        .autoOrient()
        .gamma(deepZoomRecipe.gamma)
        .webp(output)
        .tile({
          size: deepZoomRecipe.tileSize,
          overlap: deepZoomRecipe.overlap,
          layout: deepZoomRecipe.layout,
        })
        .toFile(deepZoomTargetPath);
      pyramidsGenerated += 1;
    }

    await cp(deepZoomCacheDirectory, deepZoomOutputDirectory, {
      recursive: true,
    });
    deepZoom = {
      url: `/_responsive/${deepZoomCacheKey}/image.dzi`,
      width: sourceDimensions.width,
      height: sourceDimensions.height,
      tileSize: deepZoomRecipe.tileSize,
      overlap: deepZoomRecipe.overlap,
      format: deepZoomRecipe.format,
    };
  }

  manifest.images[`/uploads/${relativePath.split(sep).join('/')}`] = {
    source: {
      url: sourceUrl,
      width: sourceDimensions.width,
      height: sourceDimensions.height,
      bytes: source.byteLength,
      format: sourceMetadata.format,
    },
    variants,
    deepZoom,
  };
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
  `Responsive images: ${generated} generated, ${reused} reused, ${omitted} omitted because they were not smaller than their sources.`,
);
console.log(
  `Deep zoom pyramids: ${pyramidsGenerated} generated, ${pyramidsReused} reused.`,
);

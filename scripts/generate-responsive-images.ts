import {
  cp,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { GENERATED_IMAGE_WIDTHS } from '../src/images';
import type {
  ImageManifest,
  ImageVariant,
  ResponsiveImage,
} from '../src/images';
import {
  deepZoomLevels,
  deepZoomOverlap,
  derivativeWidths,
  displaySourceUrl,
  imageCacheKey,
  shouldGenerateDeepZoom,
  shouldPublishDerivative,
  staleOutputs,
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
  version: 2,
  minimumLongestSide: 4096,
  gamma: 2.2,
  kernel: sharp.kernel.lanczos3,
  tileSize: 512,
  losslessOverlap: deepZoomOverlap(true),
  lossyOverlap: deepZoomOverlap(false),
  layout: 'dz' as const,
  format: 'webp',
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
};

async function referencedImages() {
  const paths = new Set<string>();

  const entries = await readdir(contentDirectory, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const contentPath = join(entry.parentPath, entry.name);
    const content = await readFile(contentPath, 'utf8');
    for (const match of content.matchAll(uploadReference)) {
      const sourcePath = resolve(sourceDirectory, match[1]);
      if (sourcePath.startsWith(`${sourceDirectory}${sep}`)) paths.add(sourcePath);
    }
  }

  return [...paths].sort();
}

const publishedFiles = new Set<string>();
let written = 0;

async function publish(outputPath: string, contents: Buffer) {
  publishedFiles.add(relative(outputDirectory, outputPath));
  const current = await readFile(outputPath).catch(() => undefined);
  if (current?.equals(contents)) return;
  await mkdir(dirname(outputPath), { recursive: true });
  // The rename swaps the file in one step, so a running dev server serves the
  // previous or the complete new file, never a missing or partial one.
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, outputPath);
  written += 1;
}

let generated = 0;
let reused = 0;
let omitted = 0;
let pyramidsGenerated = 0;
let pyramidsReused = 0;
const manifest: ImageManifest = { version: 3, images: {} };

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
  const originalUrl = `/uploads/${relativePath
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
  const sourceExtension = extname(relativePath).slice(1).toLowerCase();
  const sourceUrl = displaySourceUrl(
    originalUrl,
    cacheKey,
    sourceExtension,
  );
  if (sourceUrl !== originalUrl) {
    const sourceOutputPath = join(
      outputDirectory,
      cacheKey,
      `source.${sourceExtension}`,
    );
    await publish(sourceOutputPath, source);
  }
  const variants: ImageVariant[] = [];

  for (const width of derivativeWidths(
    sourceDimensions.width,
    GENERATED_IMAGE_WIDTHS,
  )) {
    const outputPath = join(outputDirectory, cacheKey, `${width}.webp`);
    const cachePath = join(cacheDirectory, cacheKey, `${width}.webp`);
    let variant: ImageVariant;

    try {
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
      // Renamed into place once complete, because reuse reads only its header.
      const temporaryCachePath = `${cachePath}.tmp`;
      const result = await sharp(sourcePath, { limitInputPixels: false })
        .autoOrient()
        .gamma(recipe.gamma)
        .resize({ width, kernel: recipe.kernel })
        .webp(output)
        .toFile(temporaryCachePath);
      await rename(temporaryCachePath, cachePath);
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

    await publish(outputPath, await readFile(cachePath));
    variants.push(variant);
  }

  let deepZoom: ResponsiveImage['deepZoom'];
  if (
    shouldGenerateDeepZoom(sourceDimensions.width, sourceDimensions.height)
  ) {
    const deepZoomTileOverlap = deepZoomOverlap(output.lossless);
    const deepZoomCacheKey = imageCacheKey(source, {
      ...deepZoomRecipe,
      overlap: deepZoomTileOverlap,
      output,
    });
    const deepZoomCacheDirectory = join(cacheDirectory, deepZoomCacheKey);
    const deepZoomCachePath = join(deepZoomCacheDirectory, 'image.dzi');
    const deepZoomOutputDirectory = join(outputDirectory, deepZoomCacheKey);

    try {
      await stat(deepZoomCachePath);
      pyramidsReused += 1;
    } catch {
      // Built beside its cache entry and renamed into place once complete, so
      // an interrupted run never leaves a pyramid that looks finished.
      const temporaryCacheDirectory = `${deepZoomCacheDirectory}.tmp`;
      await rm(temporaryCacheDirectory, { recursive: true, force: true });
      const temporaryLevelsDirectory = join(
        temporaryCacheDirectory,
        '.levels',
      );
      const levels = deepZoomLevels(
        sourceDimensions.width,
        sourceDimensions.height,
      );

      for (const level of levels) {
        const levelDirectory = join(
          temporaryLevelsDirectory,
          String(level.level),
        );
        const levelTargetPath = join(levelDirectory, 'image.dz');
        await mkdir(levelDirectory, { recursive: true });
        await sharp(sourcePath, { limitInputPixels: false })
          .autoOrient()
          .gamma(deepZoomRecipe.gamma)
          .resize({
            width: level.width,
            height: level.height,
            fit: 'fill',
            kernel: deepZoomRecipe.kernel,
          })
          .webp(output)
          .tile({
            size: deepZoomRecipe.tileSize,
            overlap: deepZoomTileOverlap,
            layout: deepZoomRecipe.layout,
            depth: 'one',
          })
          .toFile(levelTargetPath);
        await cp(
          join(levelDirectory, 'image_files', '0'),
          join(temporaryCacheDirectory, 'image_files', String(level.level)),
          { recursive: true },
        );
        if (level.level === levels.length - 1) {
          await copyFile(
            join(levelDirectory, 'image.dzi'),
            join(temporaryCacheDirectory, 'image.dzi'),
          );
        }
        await rm(levelDirectory, { recursive: true, force: true });
      }
      await rm(temporaryLevelsDirectory, { recursive: true, force: true });
      await rm(deepZoomCacheDirectory, { recursive: true, force: true });
      await rename(temporaryCacheDirectory, deepZoomCacheDirectory);
      pyramidsGenerated += 1;
    }

    for (const entry of await readdir(deepZoomCacheDirectory, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const tileCachePath = join(entry.parentPath, entry.name);
      await publish(
        join(
          deepZoomOutputDirectory,
          relative(deepZoomCacheDirectory, tileCachePath),
        ),
        await readFile(tileCachePath),
      );
    }
    deepZoom = {
      url: `/_responsive/${deepZoomCacheKey}/image.dzi`,
      width: sourceDimensions.width,
      height: sourceDimensions.height,
      tileSize: deepZoomRecipe.tileSize,
      overlap: deepZoomTileOverlap,
      format: deepZoomRecipe.format,
    };
  }

  manifest.images[`/uploads/${relativePath.split(sep).join('/')}`] = {
    originalUrl,
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

await publish(
  join(outputDirectory, 'manifest.json'),
  Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
);

// Runs after the new manifest is in place. A running dev server re-reads it on
// its next render, so pages rendered from then on reference only kept files.
let removed = 0;
for (const entry of staleOutputs(
  await readdir(outputDirectory, { recursive: true }),
  publishedFiles,
)) {
  await rm(join(outputDirectory, entry), { recursive: true, force: true });
  removed += 1;
}

console.log(
  `Responsive images: ${generated} generated, ${reused} reused, ${omitted} omitted because they were not smaller than their sources.`,
);
console.log(
  `Deep zoom pyramids: ${pyramidsGenerated} generated, ${pyramidsReused} reused.`,
);
console.log(
  `Published files: ${written} written, ${removed} stale entries removed.`,
);

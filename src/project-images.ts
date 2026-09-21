import type { GalleryImage } from './components/gallery';

export function uniqueProjectImages(images: GalleryImage[]) {
  const lastOccurrences = new Map<string, number>();
  images.forEach(({ image }, index) => lastOccurrences.set(image, index));

  const uniqueImages = images.filter(
    ({ image }, index) => lastOccurrences.get(image) === index,
  );
  const indexesByPath = new Map(
    uniqueImages.map(({ image }, index) => [image, index]),
  );

  return {
    images: uniqueImages,
    indexes: images.map(({ image }) => indexesByPath.get(image)!),
  };
}

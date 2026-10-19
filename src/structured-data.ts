import type { CollectionEntry } from 'astro:content';
import type { GalleryImage } from './components/gallery';
import { localizedPath } from './locale';
import { ui, type Lang } from './i18n';
import { largeImageUrl, type ResponsiveImage } from './images';
import { formatPeriod } from './period';
import { projectCover } from './projects';


type Node = Record<string, unknown>;
type Data<Collection extends 'site' | 'about' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

const text = (value?: string) => value?.trim() || undefined;
const texts = (values: (string | undefined)[]) =>
  values.flatMap((value) => text(value) ?? []);
type FactRow = Data<'about'>['awards'][number];
/** The row's filled parts in the given order, then its period in brackets. */
const factNames = (rows: FactRow[], parts: (row: FactRow) => (string | undefined)[], lang: Lang) =>
  rows.flatMap((row) => {
    const name = texts(parts(row)).join(', ');
    const period = formatPeriod(row)?.[lang];
    return name ? [period ? `${name} (${period})` : name] : [];
  });

/** Leaves out the fields the content left empty. */
const compact = (node: Node) =>
  Object.fromEntries(
    Object.entries(node).filter(
      ([, value]) =>
        value !== undefined && !(Array.isArray(value) && value.length === 0),
    ),
  );

const absolute = (path: string, site: URL) => new URL(path, site).href;
const personId = (site: URL) => absolute('/#person', site);

/** The architect; `portrait` is the root path of a raster image. */
export function person({
  site,
  owner,
  about,
  contact,
  portrait,
  lang = 'cs',
}: {
  site: URL;
  owner: Pick<Data<'site'>, 'name' | 'credential'>;
  about: Pick<Data<'about'>, 'services' | 'awards'>;
  contact: Pick<Data<'contact'>, 'email' | 'phone'>;
  portrait?: string;
  lang?: Lang;
}) {
  return compact({
    '@type': 'Person',
    '@id': personId(site),
    name: owner.name,
    honorificPrefix: text(owner.credential),
    jobTitle: ui[lang].tagline,
    url: absolute(localizedPath('/', lang), site),
    email: contact.email,
    telephone: text(contact.phone),
    image: portrait && absolute(portrait, site),
    makesOffer: texts(about.services.map((service) => service[`name_${lang}`])).map(
      (name) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name },
      }),
    ),
    award: factNames(about.awards, (row) => [row[`place_${lang}`], row[`title_${lang}`]], lang),
  });
}

export function webSite({ site, name }: { site: URL; name: string }) {
  return {
    '@type': 'WebSite',
    '@id': absolute('/#website', site),
    name,
    url: absolute('/', site),
    inLanguage: ['cs', 'en'],
  };
}

export function profilePage({ site, url }: { site: URL; url: string }) {
  return {
    '@type': 'ProfilePage',
    url,
    mainEntity: { '@id': personId(site) },
  };
}

/**
 * A project page's project, with every image occurrence in page order and
 * its responsive versions.
 */
export function creativeWork({
  site,
  url,
  project,
  description,
  images,
  responsiveImages,
  responsiveCover,
  lang = 'cs',
}: {
  site: URL;
  url: string;
  project: Pick<
    Data<'projects'>,
    'title_cs' | 'title_en' | 'location_cs' | 'location_en' | 'realization' | 'role_cs' | 'role_en' | 'collaborators' | 'award_cs' | 'award_en' | 'thumbnail'
  >;
  description?: string;
  images: GalleryImage[];
  responsiveImages: (ResponsiveImage | undefined)[];
  responsiveCover?: ResponsiveImage;
  lang?: Lang;
}) {
  const cover = projectCover(project.thumbnail, images);
  const coverIndex = images.findIndex((item) => item.image === cover?.image);
  const represented = [
    ...(cover ? [{ item: cover, responsive: responsiveCover ?? responsiveImages[coverIndex] }] : []),
    ...images.flatMap((item, index) =>
      item.image !== cover?.image && (text(item[`title_${lang}`]) || text(item[`description_${lang}`]))
        ? [{ item, responsive: responsiveImages[index] }]
        : [],
    ),
  ];
  const location = text(project[`location_${lang}`]);
  const architect = { '@id': personId(site) };
  const roleName = text(project[`role_${lang}`]);
  const contributors = project.collaborators.map(({ name, role_cs, role_en }) => {
    const person = { '@type': 'Person', name: name.trim() };
    const roleName = text(lang === 'cs' ? role_cs : role_en);
    return roleName ? { '@type': 'Role', roleName, contributor: person } : person;
  });
  return compact({
    '@type': 'CreativeWork',
    name: project[`title_${lang}`],
    contentLocation: location && { '@type': 'Place', name: location },
    description,
    inLanguage: lang,
    url,
    contributor: [roleName ? { '@type': 'Role', roleName, contributor: architect } : architect, ...contributors],
    award: text(project[`award_${lang}`]),
    creativeWorkStatus: project.realization && ui[lang][project.realization],
    image: represented.map(({ item, responsive }) => {
      const name = text(item[`title_${lang}`]);
      const caption = text(item[`description_${lang}`]);
      return compact({
        '@type': 'ImageObject',
        contentUrl: absolute(largeImageUrl(responsive, item.image), site),
        name,
        caption,
      });
    }),
  });
}

/** The page's graph, safe to inline: `<` cannot close the script or open a comment in it. */
export function jsonLd(graph: Node[]) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }).replace(/</g, '\\u003c');
}

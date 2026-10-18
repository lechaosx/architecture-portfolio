import type { CollectionEntry } from 'astro:content';
import type { GalleryImage } from './components/gallery';
import { ui } from './i18n';
import { largeImageUrl, type ResponsiveImage } from './images';
import { formatPeriod } from './period';

// schema.org JSON-LD for the page's inline script. Text is the Czech source as
// plain strings, the value type Google documents for these properties.

type Node = Record<string, unknown>;
type Data<Collection extends 'site' | 'about' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

const text = (value?: string) => value?.trim() || undefined;
const texts = (values: (string | undefined)[]) =>
  values.flatMap((value) => text(value) ?? []);
type FactRow = Data<'about'>['awards'][number];
/** The row's filled parts in the given order, then its period in brackets. */
const factNames = (rows: FactRow[], parts: (row: FactRow) => (string | undefined)[]) =>
  rows.flatMap((row) => {
    const name = texts(parts(row)).join(', ');
    const period = formatPeriod(row)?.cs;
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
}: {
  site: URL;
  owner: Pick<Data<'site'>, 'name' | 'credential'>;
  about: Pick<Data<'about'>, 'services' | 'awards'>;
  contact: Pick<Data<'contact'>, 'email' | 'phone'>;
  portrait?: string;
}) {
  return compact({
    '@type': 'Person',
    '@id': personId(site),
    name: owner.name,
    honorificPrefix: text(owner.credential),
    jobTitle: ui.cs.tagline,
    url: absolute('/', site),
    email: contact.email,
    telephone: text(contact.phone),
    image: portrait && absolute(portrait, site),
    makesOffer: texts(about.services.map((service) => service.name_cs)).map(
      (name) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name },
      }),
    ),
    award: factNames(about.awards, (row) => [row.place_cs, row.title_cs]),
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
}: {
  site: URL;
  url: string;
  project: Pick<
    Data<'projects'>,
    'title_cs' | 'location_cs' | 'realization' | 'role_cs' | 'collaborators' | 'award_cs'
  >;
  description?: string;
  images: GalleryImage[];
  responsiveImages: (ResponsiveImage | undefined)[];
}) {
  const location = text(project.location_cs);
  const architect = { '@id': personId(site) };
  const roleName = text(project.role_cs);
  const contributors = project.collaborators.map(({ name, role_cs }) => {
    const person = { '@type': 'Person', name: name.trim() };
    const roleName = text(role_cs);
    return roleName ? { '@type': 'Role', roleName, contributor: person } : person;
  });
  return compact({
    '@type': 'CreativeWork',
    name: project.title_cs,
    contentLocation: location && { '@type': 'Place', name: location },
    description,
    inLanguage: 'cs',
    url,
    contributor: [roleName ? { '@type': 'Role', roleName, contributor: architect } : architect, ...contributors],
    award: text(project.award_cs),
    creativeWorkStatus: project.realization && ui.cs[project.realization],
    // The cover, the first image, even untitled; then the described ones.
    image: images.flatMap((item, index) => {
      const name = text(item.title_cs);
      const caption = text(item.description_cs);
      return index === 0 || name || caption
        ? [
            compact({
              '@type': 'ImageObject',
              contentUrl: absolute(
                largeImageUrl(responsiveImages[index], item.image),
                site,
              ),
              name,
              caption,
            }),
          ]
        : [];
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

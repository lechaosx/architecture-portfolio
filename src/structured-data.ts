import type { CollectionEntry } from 'astro:content';
import { imageAlt, type GalleryImage } from './components/gallery';
import { localizedPath } from './locale';
import { ui, type Lang } from './i18n';
import { largeImageUrl, type ResponsiveImage } from './images';
import { formatPeriod } from './period';
import { projectDescription } from './project-description';
import { projectCover, type Project } from './projects';


type Node = Record<string, unknown>;
type Data<Collection extends 'site' | 'about' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

const text = (value?: string) => value?.trim() || undefined;
const texts = (values: (string | undefined)[]) =>
  values.flatMap((value) => text(value) ?? []);
type FactRow = Data<'about'>['awards'][number];
/** The row's filled parts in the given order, then its period in brackets. */
const factNames = (rows: FactRow[], parts: (row: FactRow) => (string | undefined)[], lang: Lang) =>
  rows.map((row) => {
    const name = texts(parts(row)).join(', ');
    const period = formatPeriod(row)?.[lang];
    return period ? `${name} (${period})` : name;
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
  owner: Pick<Data<'site'>, 'name' | 'credential' | 'description'>;
  about: Pick<Data<'about'>, 'services' | 'education' | 'awards'>;
  contact: Pick<Data<'contact'>, 'email' | 'phone' | 'ico' | 'location'>;
  portrait?: string;
  lang?: Lang;
}) {
  const ico = text(contact.ico);
  const workplace = text(contact.location?.[lang]);
  const finishedStudies = about.education.filter(({ from, to }) => to || !from);
  return compact({
    '@type': 'Person',
    '@id': personId(site),
    name: owner.name,
    honorificPrefix: text(owner.credential),
    jobTitle: ui[lang].tagline,
    description: owner.description[lang],
    url: absolute(localizedPath('/', lang), site),
    email: contact.email,
    telephone: text(contact.phone),
    // schema.org has no property for the Czech business ID; `taxID` would be the DIČ.
    identifier: ico && { '@type': 'PropertyValue', propertyID: 'IČO', value: ico },
    image: portrait && absolute(portrait, site),
    workLocation: workplace && { '@type': 'Place', name: workplace },
    // The schools only: a study's title does not establish an awarded degree.
    alumniOf: [...new Set(texts(finishedStudies.map((row) => row.place[lang])))].map(
      (name) => ({ '@type': 'EducationalOrganization', name }),
    ),
    makesOffer: texts(about.services.map((service) => service.name[lang])).map(
      (name) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name },
      }),
    ),
    award: factNames(about.awards, (row) => [row.place[lang], row.title[lang]], lang),
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

type WorkProject = Pick<
  Data<'projects'>,
  'title' | 'location' | 'realization' | 'role' | 'collaborators' | 'award' | 'project_url'
>;

/** A project's facts and credits, linked to its page when it has one. */
function work({
  site,
  url,
  project,
  description,
  lang,
}: {
  site: URL;
  url?: string;
  project: WorkProject;
  description?: string;
  lang: Lang;
}) {
  const location = text(project.location?.[lang]);
  const architect = { '@id': personId(site) };
  const roleName = text(project.role?.[lang]);
  const contributors = project.collaborators.map(({ name, role }) => {
    const person = { '@type': 'Person', name: name.trim() };
    const roleName = text(role?.[lang]);
    return roleName ? { '@type': 'Role', roleName, contributor: person } : person;
  });
  const outsidePage = text(project.project_url);
  return compact({
    '@type': 'CreativeWork',
    name: project.title[lang],
    contentLocation: location && { '@type': 'Place', name: location },
    description,
    inLanguage: lang,
    url,
    contributor: [roleName ? { '@type': 'Role', roleName, contributor: architect } : architect, ...contributors],
    award: text(project.award?.[lang]),
    creativeWorkStatus: project.realization && ui[lang][project.realization],
    subjectOf: outsidePage && { '@type': 'WebPage', url: outsidePage },
  });
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
  project: WorkProject & Pick<Data<'projects'>, 'thumbnail'>;
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
      item.image !== cover?.image && (text(item.title?.[lang]) || text(item.description?.[lang]))
        ? [{ item, responsive: responsiveImages[index] }]
        : [],
    ),
  ];
  return compact({
    ...work({ site, url, project, description, lang }),
    image: represented.map(({ item, responsive }) => {
      const name = imageAlt(item, project, lang);
      const caption = text(item.description?.[lang]);
      return compact({
        '@type': 'ImageObject',
        contentUrl: absolute(largeImageUrl(responsive, item.image), site),
        name,
        caption,
      });
    }),
  });
}

/** The work page: every published project in page order, linked to its page when it has one. */
export function collectionPage({
  site,
  url,
  projects,
  lang = 'cs',
}: {
  site: URL;
  url: string;
  projects: Project[];
  lang?: Lang;
}) {
  return {
    '@type': 'CollectionPage',
    url,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: projects.map(({ id, data }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: work({
          site,
          url: data.blocks.length > 0 ? absolute(localizedPath(`/projects/${id}/`, lang), site) : undefined,
          project: data,
          description: projectDescription(data)[lang],
          lang,
        }),
      })),
    },
  };
}

/** The page's graph, safe to inline: `<` cannot close the script or open a comment in it. */
export function jsonLd(graph: Node[]) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }).replace(/</g, '\\u003c');
}

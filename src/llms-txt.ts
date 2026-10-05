import type { CollectionEntry } from 'astro:content';
import { ui, type UiKey } from './i18n';

// /llms.txt (https://llmstxt.org): the site's facts as one Markdown file,
// each in Czech and then English.

type Data<Collection extends 'home' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

/** The languages' versions of a text, each once. */
const both = (cs?: string, en?: string) => [
  ...new Set([cs, en].flatMap((text) => text?.trim() || [])),
];
const pair = (cs?: string, en?: string) => both(cs, en).join(' / ');
const label = (key: UiKey) => pair(ui.cs[key], ui.en[key]);

const line = (text: string) => (text ? [text] : []);

function section(heading: string, blocks: string[]) {
  return blocks.length > 0 ? [`## ${heading}`, ...blocks] : [];
}

function list(rows: string[]) {
  return line(rows.filter((row) => row).map((row) => `- ${row}`).join('\n'));
}

function project(
  site: URL,
  { id, data }: Pick<CollectionEntry<'projects'>, 'id' | 'data'>,
) {
  const images = data.blocks.flatMap((block) =>
    block.type === 'text' ? [] : block.images,
  );
  return [
    `### ${pair(data.title_cs, data.title_en)}`,
    [pair(data.location_cs, data.location_en), data.year]
      .filter(Boolean)
      .join(' · '),
    ...(data.blocks.length > 0
      ? [new URL(`/projects/${id}/`, site).href]
      : []),
    ...both(data.brief_cs, data.brief_en),
    ...data.blocks.flatMap((block) =>
      block.type === 'text' ? both(block.body_cs, block.body_en) : [],
    ),
    ...images.flatMap((image, index) => {
      const title = pair(image.title_cs, image.title_en);
      const description = both(image.description_cs, image.description_en);
      if (!title && description.length === 0) return [];
      const position = index + 1;
      return [
        `#### ${title || pair(`${ui.cs.image} ${position}`, `${ui.en.image} ${position}`)}`,
        ...description,
      ];
    }),
  ];
}

export function llmsTxt({
  site,
  name,
  description,
  home,
  contact,
  projects,
}: {
  site: URL;
  /** The credentialed name. */
  name: string;
  description: { cs?: string; en?: string };
  home: Pick<
    Data<'home'>,
    'body_cs' | 'body_en' | 'services' | 'area_cs' | 'area_en' | 'education' | 'awards'
  >;
  contact: Pick<Data<'contact'>, 'email' | 'phone'>;
  /** The published projects. */
  projects: Pick<CollectionEntry<'projects'>, 'id' | 'data'>[];
}) {
  const sorted = [...projects].sort(
    (a, b) =>
      b.data.year - a.data.year || a.data.title_en.localeCompare(b.data.title_en),
  );
  const blocks = [
    `# ${name}`,
    ...line(both(description.cs, description.en).map((text) => `> ${text}`).join('\n>\n')),
    ...section(label('about'), both(home.body_cs, home.body_en)),
    ...section(
      label('services'),
      list(home.services.map((service) => pair(service.name_cs, service.name_en))),
    ),
    ...section(label('area'), line(pair(home.area_cs, home.area_en))),
    ...section(
      label('education'),
      list(home.education.map((entry) => pair(entry.text_cs, entry.text_en))),
    ),
    ...section(
      label('awards'),
      list(home.awards.map((entry) => pair(entry.text_cs, entry.text_en))),
    ),
    ...section(
      label('contact'),
      list([
        `${label('email')}: ${contact.email}`,
        ...(contact.phone ? [`${label('phone')}: ${contact.phone}`] : []),
      ]),
    ),
    ...section(
      label('work'),
      sorted.flatMap((entry) => project(site, entry)),
    ),
  ];
  return `${blocks.join('\n\n')}\n`;
}

import type { CollectionEntry } from 'astro:content';
import { ui, type UiKey } from './i18n';
import { newestFirst, type Project } from './projects';

// /llms.txt (https://llmstxt.org): the site's facts as one Markdown file,
// each in Czech and then English.

type Data<Collection extends 'about' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

/** The languages' versions of a text, each once. */
const both = (cs?: string, en?: string) => [
  ...new Set([cs, en].flatMap((text) => text?.trim() || [])),
];
const pair = (cs?: string, en?: string) => both(cs, en).join(' / ');
const label = (key: UiKey) => pair(ui.cs[key], ui.en[key]);

const line = (text: string) => (text ? [text] : []);

type TimelineRow = Data<'about'>['education'][number];

const timelineHeading = (title: string, place: string, department?: string) =>
  `${title} – ${[place, department?.trim()].filter(Boolean).join(', ')}`;
const tagNames = (row: TimelineRow, lang: 'cs' | 'en') =>
  row.tags.map((tag) => tag[`name_${lang}`]).join(', ');

/** "years · title – place, department", then each line of the description and the tags, indented under it. */
function timelineRow(row: TimelineRow) {
  const heading = [
    row.years?.trim(),
    both(
      timelineHeading(row.title_cs, row.place_cs, row.department_cs),
      timelineHeading(row.title_en, row.place_en, row.department_en),
    ).join(' / '),
  ]
    .filter(Boolean)
    .join(' · ');
  const details = [
    ...both(row.description_cs, row.description_en).flatMap((text) => text.split('\n')),
    both(tagNames(row, 'cs'), tagNames(row, 'en')).join(' / '),
  ]
    .map((detail) => detail.trim())
    .filter(Boolean);
  return [heading, ...details.map((detail) => `  ${detail}`)].join('\n');
}

function section(heading: string, blocks: string[]) {
  return blocks.length > 0 ? [`## ${heading}`, ...blocks] : [];
}

function list(rows: string[]) {
  return line(rows.filter((row) => row).map((row) => `- ${row}`).join('\n'));
}

function project(site: URL, { id, data }: Project) {
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
  about,
  contact,
  projects,
}: {
  site: URL;
  /** The credentialed name. */
  name: string;
  description: { cs?: string; en?: string };
  about: Pick<
    Data<'about'>,
    'body_cs' | 'body_en' | 'experience' | 'services' | 'education' | 'awards'
  >;
  contact: Pick<Data<'contact'>, 'email' | 'phone' | 'location_cs' | 'location_en'>;
  /** The published projects. */
  projects: Project[];
}) {
  const blocks = [
    `# ${name}`,
    ...line(both(description.cs, description.en).map((text) => `> ${text}`).join('\n>\n')),
    ...section(label('about'), both(about.body_cs, about.body_en)),
    ...section(label('experience'), list(about.experience.map(timelineRow))),
    ...section(
      label('services'),
      list(about.services.map((service) => pair(service.name_cs, service.name_en))),
    ),
    ...section(label('education'), list(about.education.map(timelineRow))),
    ...section(label('awards'), list(about.awards.map(timelineRow))),
    ...section(
      label('contact'),
      list([
        `${label('email')}: ${contact.email}`,
        ...(contact.phone ? [`${label('phone')}: ${contact.phone}`] : []),
        ...line(pair(contact.location_cs, contact.location_en)).map(
          (location) => `${label('location')}: ${location}`,
        ),
      ]),
    ),
    ...section(
      label('work'),
      [...projects].sort(newestFirst).flatMap((entry) => project(site, entry)),
    ),
  ];
  return `${blocks.join('\n\n')}\n`;
}

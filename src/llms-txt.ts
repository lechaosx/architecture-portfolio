import type { CollectionEntry } from 'astro:content';
import { localizedPath } from './locale';
import { ui, type UiKey } from './i18n';
import { formatPeriod, type Period } from './period';
import { projectBadges, projectFacts } from './project-facts';
import { newestFirst, type Project } from './projects';

type Data<Collection extends 'about' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

/** The languages' versions of a text, each once. */
const both = (cs?: string, en?: string) => [
  ...new Set([cs, en].flatMap((text) => text?.trim() || [])),
];
const pair = (cs?: string, en?: string) => both(cs, en).join(' / ');
const label = (key: UiKey) => pair(ui.cs[key], ui.en[key]);
const textLink = (title: string, url: URL) =>
  `[${title.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>~&]/g, '\\$&')}](<${url.href}>)`;

function passages(cs?: string, en?: string) {
  return [
    cs?.trim() ? `**${ui.cs.languageName}:**\n\n${cs.trim()}` : '',
    en?.trim() ? `**${ui.en.languageName}:**\n\n${en.trim()}` : '',
  ].filter(Boolean);
}

const period = (value: Period) => {
  const text = formatPeriod(value);
  return pair(text?.cs, text?.en);
};

const line = (text: string) => (text ? [text] : []);

type FactRow = Data<'about'>['education'][number];

const factHeading = (title: string, place: string, department?: string) =>
  `${title} – ${[place, department?.trim()].filter(Boolean).join(', ')}`;

/** "period · title – place, department", then each line of the description, indented under it. */
function factRow(row: FactRow) {
  const heading = [
    period(row),
    both(
      factHeading(row.title_cs, row.place_cs, row.department_cs),
      factHeading(row.title_en, row.place_en, row.department_en),
    ).join(' / '),
  ]
    .filter(Boolean)
    .join(' · ');
  const details = passages(row.description_cs, row.description_en)
    .flatMap((text) => text.split('\n'))
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
    [pair(data.location_cs, data.location_en), `${label('involvement')}: ${period(data)}`]
      .filter(Boolean)
      .join(' · '),
    ...(data.blocks.length > 0
      ? ['cs', 'en'].map((lang) => new URL(`/${lang}/projects/${id}/`, site).href)
      : []),
    ...list(projectBadges(data).length ? [`${label('projectInformation')}: ${projectBadges(data).map(label).join(' · ')}`] : []),
    ...list(
      projectFacts(data).map(
        (fact) =>
          `${label(fact.label)}: ${(fact.badges ?? []).map(label).join(' · ')}${fact.href ?? fact.lines
            .map((line) => `${[line.names.join(', '), pair(line.cs, line.en)].filter(Boolean).join(' – ')}`)
            .join('; ')}`,
      ),
    ),
    ...passages(data.brief_cs, data.brief_en),
    ...data.blocks.flatMap((block) =>
      block.type === 'text' ? passages(block.body_cs, block.body_en) : [],
    ),
    ...images.flatMap((image, index) => {
      const title = pair(image.title_cs, image.title_en);
      const description = passages(image.description_cs, image.description_en);
      if (!title && description.length === 0) return [];
      const position = index + 1;
      return [
        `#### ${textLink(title || pair(`${ui.cs.image} ${position}`, `${ui.en.image} ${position}`), new URL(image.image, site))}`,
        ...description,
      ];
    }),
  ];
}

export function llmsFullTxt({
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
    ...section(label('about'), passages(about.body_cs, about.body_en)),
    ...section(label('experience'), list(about.experience.map(factRow))),
    ...section(
      label('services'),
      list(about.services.map((service) => pair(service.name_cs, service.name_en))),
    ),
    ...section(label('education'), list(about.education.map(factRow))),
    ...section(label('awards'), list(about.awards.map(factRow))),
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
      projects.filter(({ data }) => !data.draft).sort(newestFirst).flatMap((entry) => project(site, entry)),
    ),
  ];
  return `${blocks.join('\n\n')}\n`;
}

export function llmsTxt({
  site,
  name,
  description,
  projects,
}: {
  site: URL;
  name: string;
  description: { cs?: string; en?: string };
  projects: Project[];
}) {
  const blocks = [
    `# ${name}`,
    ...line(both(description.cs, description.en).map((text) => `> ${text}`).join('\n>\n')),
    pair(ui.cs.llmsLanguages, ui.en.llmsLanguages),
    ...section(label('llmsPages'), list([
      ...(['cs', 'en'] as const).flatMap((lang) => [
        `${textLink(`${ui[lang].about} (${lang})`, new URL(localizedPath('/about/', lang), site))}: ${ui[lang].llmsAbout}`,
        `${textLink(`${ui[lang].work} (${lang})`, new URL(localizedPath('/work/', lang), site))}: ${ui[lang].llmsWork}`,
      ]),
    ])),
    ...section(label('work'), list(
      projects.filter(({ data }) => !data.draft && data.blocks.length > 0)
        .sort(newestFirst)
        .flatMap(({ id, data }) => (['cs', 'en'] as const).map((lang) => `${textLink(`${data[`title_${lang}`]} (${lang})`, new URL(localizedPath(`/projects/${id}/`, lang), site))}: ${[
          data[`location_${lang}`]?.replace(/\s+/g, ' '),
          `${ui[lang].involvement}: ${formatPeriod(data)?.[lang]}`,
        ].filter(Boolean).join(' · ')}`)),
    )),
    ...section(label('llmsResources'), list([
      `${textLink(label('llmsFull'), new URL('/llms-full.txt', site))}: ${label('llmsFullDescription')}`,
    ])),
  ];
  return `${blocks.join('\n\n')}\n`;
}

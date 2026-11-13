import type { CollectionEntry } from 'astro:content';
import { comparisonSetIndexes } from './components/gallery';
import { galleryImageHash } from './components/lightbox-history';
import { localizedPath } from './locale';
import { ui, type Lang, type UiKey } from './i18n';
import { formatPeriod, type Period } from './period';
import { projectBadges, projectFacts } from './project-facts';
import { hasPage, workProjects, type Project } from './projects';

type Data<Collection extends 'about' | 'contact' | 'projects'> =
  CollectionEntry<Collection>['data'];

type Texts = Record<Lang, string> | undefined;

/** The languages' versions of a text, each once. */
const both = (texts: Texts) => [
  ...new Set([texts?.cs, texts?.en].flatMap((text) => text?.trim() || [])),
];
const pair = (texts: Texts) => both(texts).join(' / ');
const label = (key: UiKey) => pair({ cs: ui.cs[key], en: ui.en[key] });
const textLink = (title: string, url: URL) =>
  `[${title.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>~&]/g, '\\$&')}](<${url.href}>)`;

function passages(texts: Texts) {
  return (['cs', 'en'] as const).flatMap((lang) => {
    const text = texts?.[lang].trim();
    return text ? [`**${ui[lang].languageName}:**\n\n${text}`] : [];
  });
}

const period = (value: Period) => pair(formatPeriod(value, { plain: true }));

const line = (text: string) => (text ? [text] : []);

type FactRow = Data<'about'>['education'][number] & Partial<Pick<Data<'about'>['experience'][number], 'skills'>>;

const factHeading = (row: FactRow, lang: Lang) =>
  `${row.title[lang]} – ${[row.place[lang], row.department?.[lang].trim()].filter(Boolean).join(', ')}`;

/** "period · degree · title – place, department", then its skills and each line of the description, indented under it. */
function factRow(row: FactRow) {
  const heading = [
    period(row),
    row.degree?.trim(),
    pair({ cs: factHeading(row, 'cs'), en: factHeading(row, 'en') }),
  ]
    .filter(Boolean)
    .join(' · ');
  const skills = (row.skills ?? []).map((skill) => pair(skill.name)).filter(Boolean);
  const details = [
    skills.length ? `${label('skills')}: ${skills.join('; ')}` : '',
    ...passages(row.description).flatMap((text) => text.split('\n')),
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
  const imageName = (index: number) =>
    pair(images[index].title) || pair({ cs: `${ui.cs.image} ${index + 1}`, en: `${ui.en.image} ${index + 1}` });
  return [
    `### ${pair(data.title)}`,
    [pair(data.location), `${label('involvement')}: ${period(data)}`]
      .filter(Boolean)
      .join(' · '),
    ...(hasPage(data)
      ? ['cs', 'en'].map((lang) => new URL(`/${lang}/projects/${id}/`, site).href)
      : []),
    ...list(projectBadges(data).length ? [`${label('projectInformation')}: ${projectBadges(data).map(label).join(' · ')}`] : []),
    ...list(
      projectFacts(data).map(
        (fact) =>
          `${label(fact.label)}: ${(fact.badges ?? []).map(label).join(' · ')}${fact.href ?? fact.lines
            .map((line) => `${[line.names.join(', '), pair(line)].filter(Boolean).join(' – ')}`)
            .join('; ')}`,
      ),
    ),
    ...passages(data.brief),
    ...data.blocks.flatMap((block) =>
      block.type === 'text' ? passages(block.body) : [],
    ),
    ...images.flatMap((image, index) => {
      const description = passages(image.description);
      const set = comparisonSetIndexes(images, index).filter((other) => other !== index);
      if (!pair(image.title) && description.length === 0 && set.length === 0) return [];
      return [
        `#### ${textLink(imageName(index), new URL(image.image, site))}`,
        ...list([
          `${label('llmsOnPage')}: ${(['cs', 'en'] as const)
            .map((lang) => textLink(lang, new URL(`/${lang}/projects/${id}/${galleryImageHash(index)}`, site)))
            .join(' · ')}`,
          set.length ? `${label('imageSet')}: ${set.map(imageName).join('; ')}` : '',
        ]),
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
  description: Record<Lang, string>;
  about: Pick<Data<'about'>, 'bio' | 'approaches' | 'experience' | 'services' | 'education' | 'awards'>;
  contact: Pick<Data<'contact'>, 'email' | 'phone' | 'hours' | 'location' | 'ico' | 'seat'>;
  /** The published projects. */
  projects: Project[];
}) {
  const { grid, listed } = workProjects(projects.filter(({ data }) => !data.draft));
  const blocks = [
    `# ${name}`,
    ...line(both(description).map((text) => `> ${text}`).join('\n>\n')),
    label('tagline'),
    ...section(label('about'), passages(about.bio)),
    ...section(
      label('approach'),
      about.approaches.flatMap((item) => [`### ${pair(item.label)}`, ...passages(item.text)]),
    ),
    ...section(label('experience'), list(about.experience.map(factRow))),
    ...section(
      label('services'),
      list(about.services.map((service) => pair(service.name))),
    ),
    ...section(label('education'), list(about.education.map(factRow))),
    ...section(label('awards'), list(about.awards.map(factRow))),
    ...section(
      label('contact'),
      list([
        `${label('email')}: ${contact.email}`,
        ...(contact.phone ? [`${label('phone')}: ${contact.phone}`] : []),
        ...(contact.hours
          ? [pair({ cs: `${ui.cs.callHours} ${contact.hours.cs}`, en: `${ui.en.callHours} ${contact.hours.en}` })]
          : []),
        ...(contact.ico ? [`${label('ico')}: ${contact.ico}`, label('tradeRegister')] : []),
        ...(contact.seat ? [`${label('seat')}: ${contact.seat}`] : []),
        ...line(pair(contact.location)).map(
          (location) => `${label('location')}: ${location}`,
        ),
      ]),
    ),
    ...section(
      label('work'),
      [...grid, ...listed].flatMap((entry) => project(site, entry)),
    ),
  ];
  return `${blocks.join('\n\n')}\n`;
}

export function llmsTxt({
  site,
  name,
  description,
  contact,
  projects,
}: {
  site: URL;
  name: string;
  description: Record<Lang, string>;
  contact: Pick<Data<'contact'>, 'email' | 'phone' | 'location'>;
  projects: Project[];
}) {
  const { grid, listed } = workProjects(projects.filter(({ data }) => !data.draft));
  const blocks = [
    `# ${name}`,
    ...line(both(description).map((text) => `> ${text}`).join('\n>\n')),
    label('llmsLanguages'),
    `${label('contact')}: ${[contact.email, contact.phone?.trim(), pair(contact.location)].filter(Boolean).join(' · ')}`,
    ...section(label('llmsPages'), list([
      ...(['cs', 'en'] as const).flatMap((lang) => [
        `${textLink(`${ui[lang].about} (${lang})`, new URL(localizedPath('/about/', lang), site))}: ${ui[lang].llmsAbout}`,
        `${textLink(`${ui[lang].work} (${lang})`, new URL(localizedPath('/work/', lang), site))}: ${ui[lang].llmsWork}`,
      ]),
    ])),
    ...section(label('work'), list(
      [...grid, ...listed].flatMap(({ id, data }) => (['cs', 'en'] as const).map((lang) => `${textLink(`${data.title[lang]} (${lang})`, new URL(localizedPath(hasPage(data) ? `/projects/${id}/` : '/work/', lang), site))}: ${[
        data.location?.[lang].replace(/\s+/g, ' '),
        `${ui[lang].involvement}: ${formatPeriod(data, { plain: true })?.[lang]}`,
        ...projectBadges(data).map((badge) => ui[lang][badge]),
      ].filter(Boolean).join(' · ')}`)),
    )),
    ...section(label('llmsResources'), list([
      `${textLink(label('llmsFull'), new URL('/llms-full.txt', site))}: ${label('llmsFullDescription')}`,
    ])),
  ];
  return `${blocks.join('\n\n')}\n`;
}

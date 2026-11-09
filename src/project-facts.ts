import type { CollectionEntry } from 'astro:content';
import type { Lang, UiKey } from './i18n';
import { formatPeriod } from './period';

type Data = CollectionEntry<'projects'>['data'];

/**
 * An http or https address with a plain hostname, e.g. "https://example.org/library".
 * The hostname's last label starts with a letter, so `new URL`, which reads the
 * hostname for the fact sheet, never takes it for a malformed IP address. The
 * CMS's `pattern` in .pages.yml mirrors it.
 */
export const PROJECT_URL = /^https?:\/\/(?:[\w-]+\.)*[A-Za-z][\w-]*(?:[/?#]\S*)?$/;

export interface FactLine extends Record<Lang, string> {
  names: string[];
}

/** A row of a project's fact sheet: its label and its lines. */
export interface Fact {
  label: UiKey;
  lines: FactLine[];
  badges?: UiKey[];
  href?: string;
}

const text = (value: string) => ({ names: [], cs: value, en: value });
const pair = (label: UiKey, value?: Record<Lang, string>): Fact[] =>
  value ? [{ label, lines: [{ names: [], cs: value.cs, en: value.en }] }] : [];

/** The rows of a project's fact sheet that are filled, led by its place and period where asked. */
export function projectFacts(
  project: Pick<
    Data,
    | 'from'
    | 'to'
    | 'location'
    | 'project_url'
    | 'intervention'
    | 'scope'
    | 'studio'
    | 'role'
    | 'collaborators'
    | 'award'
  >,
  { placeAndPeriod = false } = {},
): Fact[] {
  const { studio, collaborators } = project;
  const period = formatPeriod(project);
  return [
    ...(placeAndPeriod
      ? [
          ...pair('location', project.location),
          ...pair('involvement', period),
        ]
      : []),
    ...(['intervention', 'scope'] as const).flatMap((label) =>
      project[label]?.length ? [{ label, lines: [], badges: project[label] }] : [],
    ),
    ...(studio ? [{ label: 'studio' as const, lines: [text(studio)] }] : []),
    ...pair('myRole', project.role),
    ...(collaborators.length ? [{
      label: 'collaborators' as const,
      lines: collaborators.map(({ name, role }) => ({
        names: [name],
        cs: role?.cs ?? '',
        en: role?.en ?? '',
      })),
    }] : []),
    ...pair('award', project.award),
    ...(project.project_url ? [{
      label: 'projectWebsite' as const,
      href: project.project_url,
      lines: [text(new URL(project.project_url).hostname)],
    }] : []),
  ];
}

export function projectBadges(project: Pick<Data, 'context' | 'design_in_progress' | 'realization'>): UiKey[] {
  return [
    ...(project.context ?? []),
    ...(project.design_in_progress ? ['design_in_progress' as const] : []),
    ...(project.realization ? [project.realization] : []),
  ];
}

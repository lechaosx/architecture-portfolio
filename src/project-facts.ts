import type { CollectionEntry } from 'astro:content';
import { onlyIn, ui, type Lang, type UiKey } from './i18n';
import { formatPeriod } from './period';

type Data = CollectionEntry<'projects'>['data'];

/**
 * A line of a fact sheet row: names, each kept whole and joined by commas,
 * then a text in each language, after a dash where both are there.
 */
export interface FactLine extends Record<Lang, string> {
  names: string[];
}

/**
 * A row of a project's fact sheet: its label and its lines. A row filled in
 * one language names it in `lang`, so it shows only in that language.
 */
export interface Fact {
  label: UiKey;
  lang?: Lang;
  lines: FactLine[];
  badges?: UiKey[];
}

const text = (cs = '', en = cs) => ({ names: [], cs, en });
const pair = (label: UiKey, cs?: string, en?: string): Fact[] =>
  cs || en ? [{ label, lang: onlyIn(cs, en), lines: [text(cs, en ?? '')] }] : [];

/** The rows of a project's fact sheet that are filled, led by its place and period where asked. */
export function projectFacts(
  project: Pick<
    Data,
    | 'from'
    | 'to'
    | 'location_cs'
    | 'location_en'
    | 'intervention'
    | 'scope'
    | 'studio'
    | 'team'
    | 'award_cs'
    | 'award_en'
  >,
  { placeAndPeriod = false } = {},
): Fact[] {
  const { studio, team } = project;
  const period = formatPeriod(project);
  return [
    ...(placeAndPeriod
      ? [
          ...pair('location', project.location_cs, project.location_en),
          ...pair('involvement', period?.cs, period?.en),
        ]
      : []),
    ...(['intervention', 'scope'] as const).flatMap((label) =>
      project[label]?.length ? [{ label, lines: [], badges: project[label] }] : [],
    ),
    ...(studio ? [{ label: 'studio' as const, lines: [text(studio)] }] : []),
    ...(team.length ? [{
      label: 'projectTeam' as const,
      lines: team.map(({ name, author, role_cs, role_en }) => ({
        names: [name],
        cs: [author && ui.cs.designAuthor, role_cs].filter(Boolean).join(' · '),
        en: [author && ui.en.designAuthor, role_en].filter(Boolean).join(' · '),
      })),
    }] : []),
    ...pair('award', project.award_cs, project.award_en),
  ];
}

export function projectBadges(project: Pick<Data, 'context' | 'design_in_progress' | 'realization'>): UiKey[] {
  return [
    ...(project.context ?? []),
    ...(project.design_in_progress ? ['design_in_progress' as const] : []),
    ...(project.realization ? [project.realization] : []),
  ];
}

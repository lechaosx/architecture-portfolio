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
    | 'status'
    | 'studio'
    | 'team'
    | 'collaborators'
    | 'award_cs'
    | 'award_en'
  >,
  { placeAndPeriod = false } = {},
): Fact[] {
  const { status, studio, team, collaborators } = project;
  const period = formatPeriod(project);
  return [
    ...(placeAndPeriod
      ? [
          ...pair('location', project.location_cs, project.location_en),
          ...pair('period', period?.cs, period?.en),
        ]
      : []),
    ...(status ? [{ label: 'status' as const, lines: [text(ui.cs[status], ui.en[status])] }] : []),
    ...(studio ? [{ label: 'studio' as const, lines: [text(studio)] }] : []),
    ...(team.length > 0 ? [{ label: 'team' as const, lines: [{ names: team, cs: '', en: '' }] }] : []),
    ...(collaborators.length > 0
      ? [
          {
            label: 'collaborators' as const,
            lines: collaborators.map(({ name, role_cs = '', role_en = '' }) => ({
              names: [name],
              cs: role_cs,
              en: role_en,
            })),
          },
        ]
      : []),
    ...pair('award', project.award_cs, project.award_en),
  ];
}

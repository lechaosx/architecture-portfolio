import { ui, type Lang } from './i18n';

/** A span of time, as a project and an About row hold it; no end means ongoing. */
export interface Period {
  from?: string;
  to?: string;
}

/** A year, or a month and year: "2023", "3/2023". The CMS's `pattern` in .pages.yml mirrors it. */
export const DATE = /^(?:(0?[1-9]|1[0-2])\/)?(\d{4})$/;

const parse = (text: string) => {
  const [, month, year] = DATE.exec(text) ?? [];
  return { year: Number(year), month: month ? Number(month) : undefined };
};

// Months counted from year 0. A year without a month covers the whole year: it
// starts in January and ends in December.
const start = (period: Period) => {
  if (period.from === undefined) return -Infinity;
  const { year, month } = parse(period.from);
  return year * 12 + (month ?? 1);
};
const end = (period: Period) => {
  if (period.to === undefined) return Infinity;
  const { year, month } = parse(period.to);
  return year * 12 + (month ?? 12);
};

/** The date in ISO 8601: "2023", "2023-03". */
export const isoDate = (text: string) => {
  const { year, month } = parse(text);
  return month ? `${year}-${String(month).padStart(2, '0')}` : String(year);
};

/** What a content edit got wrong about a period that the CMS cannot check, by field. */
export function periodIssues(period: Period) {
  const issues: { field: keyof Period; message: string }[] = [];
  if (period.to !== undefined && period.from === undefined) {
    issues.push({ field: 'to', message: 'An end needs a start' });
  } else if (end(period) < start(period)) {
    issues.push({ field: 'to', message: 'The end is before the start' });
  }
  return issues;
}

const format = (text: string) => {
  const { year, month } = parse(text);
  return month ? `${month}/${year}` : String(year);
};

/** "3/2023–6/2024"; an identical start and end once; an ongoing period up to "dosud"/"present". */
export function formatPeriod(period: Period): Record<Lang, string> | undefined {
  if (period.from === undefined) return undefined;
  const from = format(period.from);
  const until = (to: string) => (to === from ? from : `${from}–${to}`);
  if (period.to === undefined) {
    return { cs: until(ui.cs.ongoing), en: until(ui.en.ongoing) };
  }
  const text = until(format(period.to));
  return { cs: text, en: text };
}

/** Ongoing first, then the latest end, then the latest start. */
export const latestFirst = (a: Period, b: Period) => {
  const descending = (x: number, y: number) => (x === y ? 0 : x < y ? 1 : -1);
  return descending(end(a), end(b)) || descending(start(a), start(b));
};

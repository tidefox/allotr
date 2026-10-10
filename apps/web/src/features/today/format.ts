import type { LocalDate } from '@allotr/shared';

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** A calendar day as "Apr 1" in the user's locale; never shifted by zone. */
export function formatDay(date: LocalDate, locale: string): string {
  let formatter = dayFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    dayFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${date}T00:00:00Z`));
}

const longFormatters = new Map<string, Intl.DateTimeFormat>();

/** A calendar day as "Tuesday, April 1" in the user's locale. */
export function formatLongDay(date: LocalDate, locale: string): string {
  let formatter = longFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    longFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${date}T00:00:00Z`));
}

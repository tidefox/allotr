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

const terminalFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A calendar day as the shell's lower-case "fri oct 09": weekday, month and
 * a two-digit day, in the user's locale; never shifted by zone.
 */
export function formatTerminalDay(date: LocalDate, locale: string): string {
  let formatter = terminalFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      timeZone: 'UTC',
    });
    terminalFormatters.set(locale, formatter);
  }
  return formatter
    .formatToParts(new Date(`${date}T00:00:00Z`))
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(' ')
    .toLocaleLowerCase(locale);
}

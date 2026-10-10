import {
  currencyCode,
  type LedgerSettingsView,
  type PaydayRule,
  type UpdateLedgerSettingsBody,
} from '@allotr/shared';

// Pure helpers for the setup screen's steps. Each step saves only what the
// user changed, so an untouched step saves nothing and counts as handled.

export interface RegionDraft {
  locale: string;
  timeZone: string;
  /** An ISO 4217 code chosen from the currency menu. */
  defaultCurrency: string;
}

/** Only the region fields that differ from what is saved. */
export function regionChanges(
  settings: LedgerSettingsView,
  next: RegionDraft,
): UpdateLedgerSettingsBody {
  return {
    ...(next.locale === settings.locale ? {} : { locale: next.locale }),
    ...(next.timeZone === settings.timeZone ? {} : { timeZone: next.timeZone }),
    ...(next.defaultCurrency === settings.defaultCurrency
      ? {}
      : { defaultCurrency: currencyCode(next.defaultCurrency) }),
  };
}

/** Only the payday fields that differ from what is saved. */
export function paydayChanges(
  settings: LedgerSettingsView,
  rule: PaydayRule,
  day: number,
): UpdateLedgerSettingsBody {
  return {
    ...(rule === settings.paydayRule ? {} : { paydayRule: rule }),
    ...(day === settings.paydayDay ? {} : { paydayDay: day }),
  };
}

/** The days of a month a payday or bill can fall on. */
export const MONTH_DAYS: readonly number[] = Array.from(
  { length: 31 },
  (_, i) => i + 1,
);

/** Whether a body has nothing to save. */
export function isEmpty(body: UpdateLedgerSettingsBody): boolean {
  return Object.keys(body).length === 0;
}

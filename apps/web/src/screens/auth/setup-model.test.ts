import type { LedgerSettingsView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  isEmpty,
  MONTH_DAYS,
  paydayChanges,
  regionChanges,
} from './setup-model';

const settings = {
  locale: 'en-US',
  timeZone: 'UTC',
  defaultCurrency: 'USD',
  paydayRule: 'fixed',
  paydayDay: 25,
} as LedgerSettingsView;

describe('regionChanges', () => {
  it('is empty when nothing differs', () => {
    expect(
      isEmpty(
        regionChanges(settings, {
          locale: 'en-US',
          timeZone: 'UTC',
          defaultCurrency: 'USD',
        }),
      ),
    ).toBe(true);
  });

  it('keeps only the fields that changed', () => {
    expect(
      regionChanges(settings, {
        locale: 'de-DE',
        timeZone: 'UTC',
        defaultCurrency: 'EUR',
      }),
    ).toEqual({ locale: 'de-DE', defaultCurrency: 'EUR' });
  });
});

describe('paydayChanges', () => {
  it('keeps only the fields that changed', () => {
    expect(paydayChanges(settings, 'fixed', 25)).toEqual({});
    expect(paydayChanges(settings, 'fixed', 1)).toEqual({ paydayDay: 1 });
    expect(paydayChanges(settings, 'manual', 25)).toEqual({
      paydayRule: 'manual',
    });
  });
});

describe('MONTH_DAYS', () => {
  it('runs from 1 to 31', () => {
    expect(MONTH_DAYS[0]).toBe(1);
    expect(MONTH_DAYS).toHaveLength(31);
    expect(MONTH_DAYS.at(-1)).toBe(31);
  });
});

import {
  isLocalDate,
  type CreateRateBody,
  type LocalDate,
  type PaydayRule,
} from '@allotr/shared';
import { parseRate } from '@/features/settings/bill-draft.ts';

// Pure helpers for the Money tab: what the forms accept and the request each
// one makes. The server validates again; nothing here computes money.

/** Days of the month a payday can be set to. */
export const paydayDays: readonly number[] = Array.from(
  { length: 31 },
  (_, i) => i + 1,
);

/** The last working day follows the calendar, so it takes no day of month. */
export function usesPaydayDay(rule: PaydayRule): boolean {
  return rule !== 'last-working-day';
}

/** Text for the payday override: a date, or empty to clear it. */
export function parsePaydayOverride(
  text: string,
): LocalDate | null | 'invalid' {
  const value = text.trim();
  if (value === '') return null;
  return isLocalDate(value) ? value : 'invalid';
}

export type RateErrors = Partial<
  Record<'base' | 'quote' | 'rate' | 'asOf', 'base' | 'same' | 'rate' | 'asOf'>
>;

export interface RateInput {
  base: string;
  quote: string;
  rate: string;
  asOf: string;
}

/** The request body for a rate form, or the fields that are wrong. */
export function toRateBody(
  input: RateInput,
): { body: CreateRateBody } | { errors: RateErrors } {
  const parsed = parseRate(input.rate);
  const asOf = input.asOf.trim();
  const errors: RateErrors = {
    ...(input.base === '' ? { base: 'base' as const } : {}),
    ...(input.base !== '' && input.base === input.quote
      ? { quote: 'same' as const }
      : {}),
    ...(parsed === null ? { rate: 'rate' as const } : {}),
    ...(asOf !== '' && !isLocalDate(asOf) ? { asOf: 'asOf' as const } : {}),
  };
  if (Object.keys(errors).length > 0 || parsed === null) return { errors };
  return {
    body: {
      base: input.base,
      quote: input.quote,
      rate: parsed,
      ...(asOf === '' ? {} : { asOf }),
    },
  };
}

import type { ImportResult } from '@allotr/shared';
import { deviceParts } from '@/features/settings/device';
import type { AuthSession } from '@/lib/endpoints';
import { t } from '@/messages/t';

/** The base32 secret in an otpauth URI, in groups of four for typing. */
export function secretOf(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret') ?? '';
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

/** A short name for a signed-in device, such as "Firefox on Linux". */
export function deviceName(session: Pick<AuthSession, 'userAgent'>): string {
  const { browser, system } = deviceParts(session.userAgent);
  if (browser !== undefined && system !== undefined)
    return t('settings.security.deviceOn', { browser, system });
  return browser ?? system ?? t('settings.security.unknownDevice');
}

/** Most recently active first; the input is left alone. */
export function byRecentActivity<T extends { updatedAt: Date }>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

/** A code field's text without spaces, as the server expects it. */
export function compactCode(input: string): string {
  return input.replace(/\s/g, '');
}

export const importCountKeys = [
  'accounts',
  'categoriesCreated',
  'categoriesMatched',
  'rates',
  'tags',
  'transactions',
  'bills',
  'billPayments',
  'reconciliations',
  'ious',
  'pools',
  'budgets',
  'coverOverrides',
] as const satisfies readonly (keyof ImportResult)[];

/** The counts the server reported that are not zero, in display order. */
export function importedCounts(
  result: ImportResult,
): { key: (typeof importCountKeys)[number]; count: number }[] {
  return importCountKeys
    .map((key) => ({ key, count: result[key] }))
    .filter(({ count }) => count > 0);
}

export const maxImportBytes = 10 * 1024 * 1024;

/** What reading a chosen file gives: parsed JSON, or why it cannot be sent. */
export type ParsedFile =
  { ok: true; value: unknown } | { ok: false; reason: 'tooLarge' | 'notJson' };

export function parseImportFile(text: string, bytes: number): ParsedFile {
  if (bytes > maxImportBytes) return { ok: false, reason: 'tooLarge' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'notJson' };
  }
}

/** Whole kilobytes, at least one, for the file-size line. */
export function kilobytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}

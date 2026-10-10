import { useQuery } from '@tanstack/react-query';
import { ledgerSettingsQuery } from '@/lib/ledger';

// This device's language and zone, for a user who cannot read their ledger
// settings until they enrol in two-factor authentication.
const deviceLocale = navigator.language;
const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The ledger's language and zone, or this device's until they are known. */
export function useRegion(enabled: boolean): {
  locale: string;
  timeZone: string;
} {
  const settings = useQuery({ ...ledgerSettingsQuery, enabled });
  return {
    locale: settings.data?.locale ?? deviceLocale,
    timeZone: settings.data?.timeZone ?? deviceTimeZone,
  };
}

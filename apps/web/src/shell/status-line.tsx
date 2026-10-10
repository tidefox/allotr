import { daysBetween } from '@allotr/shared';
import { useIsFetching, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { BracketButton } from '@/components/buttons';
import { formatDay } from '@/features/today/format';
import { todayQuery } from '@/lib/ledger';
import { useLedgerReady } from '@/lib/session';
import { useOnline } from '@/lib/online';
import { applyUpdate, updateStore } from '@/lib/service-worker';
import { t } from '@/messages/t';

// The status line, from 600 px (docs/ui.md §3): mode block, cycle day,
// payday, currency, key hints and sync state. Days are dates, not money, so
// the cycle day is counted here from the server's dates.

// Offers the new version once its service worker has installed. Reloading
// is the user's choice, so an entry being typed is never thrown away. The
// polite live region stays mounted so the offer is announced when it appears.
function UpdateNotice() {
  const waiting = useSyncExternalStore(
    updateStore.subscribe,
    updateStore.getSnapshot,
  );
  return (
    <span
      aria-live="polite"
      data-update
      className="flex items-center gap-1 text-primary"
    >
      {waiting === null ? null : (
        <>
          <span>{t('shell.status.update')}</span>
          <BracketButton
            className="min-h-0"
            onPress={() => {
              applyUpdate(waiting, navigator.serviceWorker, () => {
                window.location.reload();
              });
            }}
          >
            {t('shell.status.reload')}
          </BracketButton>
          <BracketButton
            className="min-h-0 text-text-muted"
            onPress={updateStore.dismiss}
          >
            {t('shell.status.later')}
          </BracketButton>
        </>
      )}
    </span>
  );
}

export function StatusLine() {
  const ready = useLedgerReady();
  const today = useQuery({ ...todayQuery, enabled: ready }).data;
  const online = useOnline();
  const fetching = useIsFetching() > 0;
  const sync = !online ? 'offline' : fetching ? 'syncing' : 'synced';
  return (
    <footer
      aria-label={t('shell.slots.status')}
      data-slot="status"
      className="hidden h-bar items-center gap-3 border-t bg-chrome pr-3 text-small medium:col-span-full medium:row-start-5 medium:flex"
    >
      <span className="flex h-full items-center bg-primary px-3 font-semibold text-on-primary">
        {t('shell.status.mode')}
      </span>
      {today === undefined ? null : (
        <>
          <span>
            {t('shell.status.cycleDay', {
              day: daysBetween(today.cycle.openedOn, today.today) + 1,
            })}
          </span>
          <span>
            {t('shell.status.payday', {
              date: formatDay(today.cycleEnd, 'en'),
            })}
          </span>
          <span>{today.onBudget.currency}</span>
        </>
      )}
      <span
        data-key-hints
        className="hidden min-w-0 flex-1 truncate text-text-muted wide:inline"
      >
        {t('shell.status.keys')}
      </span>
      <span className="ml-auto flex items-center gap-3">
        <UpdateNotice />
        <span role="status" className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className={sync === 'synced' ? 'text-positive' : 'text-text-muted'}
          >
            ●
          </span>
          {t(`shell.status.${sync}`)}
        </span>
      </span>
    </footer>
  );
}

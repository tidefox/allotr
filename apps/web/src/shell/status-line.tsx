import { useIsFetching, useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { BracketButton } from '@/components/buttons';
import { formatTerminalDay } from '@/features/today/format';
import { todayQuery } from '@/lib/ledger';
import { useLedgerReady } from '@/lib/session';
import { useOnline } from '@/lib/online';
import { applyUpdate, updateStore } from '@/lib/service-worker';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { cycleDays } from './summary-math.ts';
import { screenOf } from './title-strip.tsx';

// The status line, from 600 px (docs/ui.md §3): mode block, cycle day,
// payday, currency, key hints and sync state. Days are dates, not money, so
// the cycle day is counted here from the server's dates.

// Offers the new version once its service worker has installed. Reloading
// is the user's choice, so an entry being typed is never thrown away. The
// polite live region stays mounted so the offer is announced when it appears.
function useWaiting() {
  return useSyncExternalStore(updateStore.subscribe, updateStore.getSnapshot);
}

function UpdateActions({
  waiting,
}: {
  waiting: NonNullable<ReturnType<typeof updateStore.getSnapshot>>;
}) {
  return (
    <>
      <span>{t('shell.status.update')}</span>
      <BracketButton
        className="min-h-0 compact:min-h-hit"
        onPress={() => {
          applyUpdate(waiting, navigator.serviceWorker, () => {
            window.location.reload();
          });
        }}
      >
        {t('shell.status.reload')}
      </BracketButton>
      <BracketButton
        className="min-h-0 text-text-muted compact:min-h-hit"
        onPress={updateStore.dismiss}
      >
        {t('shell.status.later')}
      </BracketButton>
    </>
  );
}

function UpdateNotice() {
  const waiting = useWaiting();
  return (
    <span
      aria-live="polite"
      data-update
      className="flex items-center gap-1 text-primary"
    >
      {waiting === null ? null : <UpdateActions waiting={waiting} />}
    </span>
  );
}

// On phones the status line is hidden, so the same offer is a one-line bar
// above the tab bar (docs/ui.md §3). It takes no room until a version waits.
export function UpdateBar() {
  const waiting = useWaiting();
  return (
    <div
      aria-live="polite"
      data-update-bar
      className={
        waiting === null
          ? 'medium:hidden'
          : 'col-start-1 row-start-5 flex min-h-hit items-center gap-2 border-t border-outline bg-chrome px-3 text-small text-primary medium:hidden'
      }
    >
      {waiting === null ? null : <UpdateActions waiting={waiting} />}
    </div>
  );
}

const seg = 'flex h-full items-center border-r px-2.5';

const timeFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function StatusLine() {
  const ready = useLedgerReady();
  const todayQueryState = useQuery({ ...todayQuery, enabled: ready });
  const today = todayQueryState.data;
  const screen = screenOf(useLocation().pathname);
  const online = useOnline();
  const fetching = useIsFetching() > 0;
  const sync = !online ? 'offline' : fetching ? 'syncing' : 'synced';
  const syncedAt = todayQueryState.dataUpdatedAt;
  return (
    <footer
      aria-label={t('shell.slots.status')}
      data-slot="status"
      className="hidden h-status items-stretch overflow-hidden border-t border-outline bg-chrome text-tiny whitespace-nowrap text-text-muted medium:col-span-full medium:row-start-5 medium:flex"
    >
      <span
        className={cn(
          seg,
          'border-r-0 bg-primary font-bold tracking-[0.06em] text-on-primary',
        )}
      >
        {t(`shell.status.mode.${screen}`)}
      </span>
      {today === undefined ? null : (
        <>
          <span className={seg}>
            {t('shell.status.cycleDay', {
              ...cycleDays(today.cycle.openedOn, today.today, today.cycleEnd),
            })}
          </span>
          <span className={seg}>
            {t('shell.status.payday', {
              date: formatTerminalDay(today.cycleEnd, 'en'),
              count: today.daysLeft,
            })}
          </span>
          <span className={seg}>{today.onBudget.currency}</span>
        </>
      )}
      <span data-key-hints className={cn(seg, 'min-w-0')}>
        <span className="truncate">{t('shell.status.keys')}</span>
      </span>
      <span className="ml-auto flex items-center gap-3 border-l px-2.5">
        <UpdateNotice />
        <span role="status" className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={sync === 'synced' ? 'text-positive' : 'text-text-muted'}
          >
            ●
          </span>
          {sync === 'synced' && syncedAt > 0
            ? t('shell.status.syncedAt', {
                time: timeFormat.format(new Date(syncedAt)),
              })
            : t(`shell.status.${sync}`)}
        </span>
      </span>
    </footer>
  );
}

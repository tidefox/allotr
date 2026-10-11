import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AccountView } from '@allotr/shared';
import { BracketButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { ledgerSettingsQuery, todayQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { CreateAccountForm } from './create-account-form.tsx';

/**
 * Adds an account. The form needs the default currency, the locale and
 * today's date, so the sheet waits for them. Closing is held back while the
 * request is in flight.
 */
export function NewAccountSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (account: AccountView) => void;
}) {
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const [busy, setBusy] = useState(false);
  const failed = settings.isError || today.isError;

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={t('accountsScreen.add.title')}
      closeLabel={t('quickEntry.close')}
    >
      <div className="flex flex-col gap-3 p-3">
        {settings.data !== undefined && today.data !== undefined ? (
          <CreateAccountForm
            settings={settings.data}
            today={today.data.today}
            autoFocus
            onBusyChange={setBusy}
            onCreated={onCreated}
          />
        ) : failed ? (
          <div role="alert" className="flex items-center gap-2 text-small">
            <span className="text-negative">
              {t('accountsScreen.add.failed')}
            </span>
            <BracketButton
              onPress={() => {
                void settings.refetch();
                void today.refetch();
              }}
            >
              {t('accountsScreen.retry')}
            </BracketButton>
          </div>
        ) : (
          <p className="text-small text-text-muted">
            {t('accountsScreen.add.loading')}
          </p>
        )}
      </div>
    </Sheet>
  );
}

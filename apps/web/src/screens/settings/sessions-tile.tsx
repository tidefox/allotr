import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BracketButton, Tag } from '@/components/buttons';
import { Tile } from '@/components/layout';
import type { RowColumn } from '@/components/row-columns';
import { Row } from '@/components/row';
import { formatMoment } from '@/features/ledger/format';
import type { AuthSession } from '@/lib/endpoints';
import {
  authSessionsQuery,
  revokeOtherSessions,
  revokeSession,
} from '@/lib/session';
import { t } from '@/messages/t';
import { byRecentActivity, deviceName } from './account-model.ts';
import { ConfirmSheet, Notice } from './setting-parts.tsx';
import { refreshSession } from './two-factor-tile.tsx';

const columns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: 'minmax(0, 11rem)', from: 'medium' },
  { width: '8rem', from: 'wide' },
  { width: 'auto' },
];

type Pending = { kind: 'one'; session: AuthSession } | { kind: 'others' };

/** Signed-in devices; revoking one, or all the others, confirms in a sheet. */
export function SessionsTile({
  locale,
  timeZone,
}: {
  locale: string;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const devices = useQuery(authSessionsQuery);
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState('');
  const revoke = useMutation({
    mutationFn: (target: Pending) =>
      target.kind === 'one'
        ? revokeSession(target.session.token)
        : revokeOtherSessions(),
    onSuccess: async (_, target) => {
      await refreshSession(queryClient);
      setStatus(
        target.kind === 'one'
          ? t('settings.security.revoked', { name: deviceName(target.session) })
          : t('settings.security.revokedOthers'),
      );
      setPending(null);
    },
  });

  const list = devices.data;
  const many = (list?.sessions.length ?? 0) > 1;
  const actions = many ? (
    <BracketButton
      tone="destructive"
      onPress={() => {
        revoke.reset();
        setPending({ kind: 'others' });
      }}
    >
      {t('settingsAccount.sessions.signOutAll')}
    </BracketButton>
  ) : undefined;

  return (
    <Tile
      title={t('settingsAccount.sessions.title')}
      actions={actions}
      bodyClassName="px-0 pb-0"
    >
      {devices.isError ? (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-2 text-small"
        >
          <span className="text-negative">{t('settingsAccount.failed')}</span>
          <BracketButton
            onPress={() => {
              void devices.refetch();
            }}
          >
            {t('settingsAccount.retry')}
          </BracketButton>
        </div>
      ) : list === undefined ? (
        <Notice role="status">{t('settingsAccount.loading')}</Notice>
      ) : (
        byRecentActivity(list.sessions).map((device) => {
          const current = device.token === list.currentToken;
          const name = deviceName(device);
          return (
            <Row
              key={device.id}
              columns={columns}
              cells={[
                <span key="name" className="flex items-center gap-2">
                  <span className="truncate">{name}</span>
                  {current ? (
                    <Tag tone="positive">
                      {t('settings.security.thisDevice')}
                    </Tag>
                  ) : null}
                </span>,
                <span key="when" className="font-ui text-text-muted">
                  {formatMoment(
                    device.updatedAt.toISOString(),
                    locale,
                    timeZone,
                  )}
                </span>,
                <span key="ip" className="font-ui text-text-muted">
                  {device.ipAddress ?? ''}
                </span>,
                current ? null : (
                  <BracketButton
                    tone="destructive"
                    aria-label={`${t('settingsAccount.sessions.signOut')} ${name}`}
                    onPress={() => {
                      revoke.reset();
                      setPending({ kind: 'one', session: device });
                    }}
                  >
                    {t('settingsAccount.sessions.signOut')}
                  </BracketButton>
                ),
              ]}
            />
          );
        })
      )}
      <p role="status" className="px-3 py-1 text-small empty:p-0">
        {status}
      </p>
      {pending === null ? null : (
        <ConfirmSheet
          title={
            pending.kind === 'one'
              ? t('settingsAccount.sessions.confirmTitle', {
                  name: deviceName(pending.session),
                })
              : t('settingsAccount.sessions.confirmAllTitle')
          }
          body={t(
            pending.kind === 'one'
              ? 'settingsAccount.sessions.confirmBody'
              : 'settingsAccount.sessions.confirmAllBody',
          )}
          confirmLabel={t('settingsAccount.sessions.confirmAction')}
          workingLabel={t('settingsAccount.sessions.working')}
          pending={revoke.isPending}
          error={revoke.error}
          onConfirm={() => {
            revoke.mutate(pending);
          }}
          onClose={() => {
            setPending(null);
          }}
        />
      )}
    </Tile>
  );
}

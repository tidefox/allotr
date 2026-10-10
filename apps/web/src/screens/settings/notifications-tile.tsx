import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BracketButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import {
  applicationServerKey,
  currentSupport,
  toSubscriptionBody,
} from '@/features/reminders/push';
import { describeProblem } from '@/lib/problem';
import {
  pushConfigQuery,
  pushSubscriptionsQuery,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from '@/lib/reminders';
import { t } from '@/messages/t';
import { SettingRow } from './app-parts.tsx';

// Opt-in Web Push for this device (ADR 0024). Off by default: nothing here
// asks for permission or contacts a push service until "turn on" is pressed.
// The privacy line says in plain words that notifications travel through the
// browser vendor's push service.

function registration() {
  return navigator.serviceWorker.getRegistration();
}

async function browserSubscription() {
  const worker = await registration();
  return (await worker?.pushManager.getSubscription()) ?? null;
}

type Problem = 'refused' | 'no-worker' | 'invalid';

export function NotificationsTile() {
  const queryClient = useQueryClient();
  const support = currentSupport();
  const usable = support.state === 'available';
  const here = useQuery({
    queryKey: ['push', 'browser'],
    queryFn: browserSubscription,
    enabled: usable,
  });
  const subscriptions = useQuery({
    ...pushSubscriptionsQuery,
    enabled: usable,
  });
  const config = useQuery({ ...pushConfigQuery, enabled: usable });
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['push'] });
  const turnOn = useMutation({
    mutationFn: async (): Promise<'on' | Problem> => {
      if (config.data === undefined) throw new Error('no key');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return 'refused';
      const worker = await registration();
      if (worker === undefined) return 'no-worker';
      const subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.data.publicKey),
      });
      const body = toSubscriptionBody(subscription.toJSON());
      if (body === null) {
        await subscription.unsubscribe();
        return 'invalid';
      }
      await subscribePush(body);
      return 'on';
    },
    onSuccess: async (result) => {
      setNote(
        result === 'on'
          ? null
          : t(`settingsApp.notifications.problems.${result}`),
      );
      await refresh();
    },
  });
  const turnOff = useMutation({
    mutationFn: async () => {
      const subscription = await browserSubscription();
      if (subscription === null) return;
      const { endpoint } = subscription;
      await subscription.unsubscribe();
      await unsubscribePush(endpoint);
    },
    onSuccess: async () => {
      setNote(null);
      await refresh();
    },
  });
  const test = useMutation({
    mutationFn: sendTestPush,
    onSuccess: (result) => {
      setNote(
        t(
          result.sent > 0
            ? 'settingsApp.notifications.testSent'
            : 'settingsApp.notifications.testNone',
        ),
      );
    },
  });

  const endpoint = here.data?.endpoint;
  const on =
    endpoint !== undefined &&
    (subscriptions.data?.subscriptions.some((s) => s.endpoint === endpoint) ??
      false);
  const failure = turnOn.error ?? turnOff.error ?? test.error;

  let body;
  if (support.state === 'unsupported') {
    body = <Message>{t('settingsApp.notifications.unsupported')}</Message>;
  } else if (support.state === 'blocked') {
    body = <Message>{t('settingsApp.notifications.blocked')}</Message>;
  } else if (config.isError) {
    // The server could not give its push key, so there is nothing to
    // subscribe to.
    body = (
      <div
        role="alert"
        className="flex items-center gap-2 border-b px-3 py-2 text-small"
      >
        <span className="text-negative">
          {t('settingsApp.notifications.serverOff')}
        </span>
        <BracketButton
          onPress={() => {
            void config.refetch();
          }}
        >
          {t('settingsApp.notifications.retry')}
        </BracketButton>
      </div>
    );
  } else {
    body = (
      <SettingRow
        label={t('settingsApp.notifications.push')}
        hint={t(
          on ? 'settingsApp.notifications.on' : 'settingsApp.notifications.off',
        )}
      >
        <span className="flex items-center gap-1">
          {on ? (
            <>
              <BracketButton
                isDisabled={test.isPending}
                onPress={() => {
                  test.mutate();
                }}
              >
                {t('settingsApp.notifications.test')}
              </BracketButton>
              <BracketButton
                isDisabled={turnOff.isPending}
                onPress={() => {
                  turnOff.mutate();
                }}
              >
                {t('settingsApp.notifications.turnOff')}
              </BracketButton>
            </>
          ) : (
            <BracketButton
              isDisabled={
                turnOn.isPending || config.data === undefined || here.isPending
              }
              onPress={() => {
                turnOn.mutate();
              }}
            >
              {t('settingsApp.notifications.turnOn')}
            </BracketButton>
          )}
        </span>
      </SettingRow>
    );
  }

  return (
    <Tile
      title={t('settingsApp.notifications.title')}
      subtitle={t('settingsApp.notifications.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <p
        data-testid="push-privacy"
        className="border-b px-3 py-2 font-sans text-small text-text-muted"
      >
        {t('settingsApp.notifications.privacy')}
      </p>
      {body}
      {note === null ? null : (
        <p role="status" className="border-b px-3 py-2 text-small">
          {note}
        </p>
      )}
      {failure === null ? null : (
        <p role="alert" className="border-b px-3 py-2 text-small text-negative">
          {describeProblem(failure).message}
        </p>
      )}
    </Tile>
  );
}

function Message({ children }: { children: string }) {
  return <p className="border-b px-3 py-2 text-small">{children}</p>;
}

import type { SessionView } from '@allotr/shared';
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { renderSVG } from 'uqr';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import {
  authSessionsQuery,
  disableTwoFactor,
  enableTwoFactor,
  sessionQuery,
  verifyTotp,
} from '@/lib/session';
import { t } from '@/messages/t';
import { compactCode, secretOf } from './account-model.ts';
import {
  FailureLine,
  Notice,
  SecretField,
  SettingRow,
} from './settings-parts.tsx';

export async function refreshSession(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: authSessionsQuery.queryKey }),
  ]);
}

type Step =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; totpURI: string; backupCodes: readonly string[] };

function PasswordSheet({
  enabled,
  onEnrol,
  onDisabled,
  onClose,
}: {
  enabled: boolean;
  onEnrol: (start: { totpURI: string; backupCodes: readonly string[] }) => void;
  onDisabled: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const enable = useMutation({
    mutationFn: enableTwoFactor,
    onSuccess: onEnrol,
  });
  const disable = useMutation({
    mutationFn: disableTwoFactor,
    onSuccess: onDisabled,
  });
  const active = enabled ? disable : enable;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    active.mutate(password);
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t(
        enabled
          ? 'settingsAccount.twoFactor.passwordTitleOff'
          : 'settingsAccount.twoFactor.passwordTitleOn',
      )}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-ui text-small text-text-muted">
          {t(
            enabled
              ? 'settingsAccount.twoFactor.passwordIntroOff'
              : 'settingsAccount.twoFactor.passwordIntroOn',
          )}
        </p>
        <SecretField
          label={t('settings.security.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          autoFocus
        />
        <FailureLine error={active.error} />
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('settingsAccount.cancel')}
          </BracketButton>
          <PrimaryButton
            type="submit"
            isDisabled={active.isPending || password === ''}
          >
            {active.isPending
              ? t('settings.security.checking')
              : enabled
                ? t('settings.security.turnOffSubmit')
                : t('settings.security.continue')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}

function ScanSheet({
  totpURI,
  backupCodes,
  onDone,
  onClose,
}: {
  totpURI: string;
  backupCodes: readonly string[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const verify = useMutation({ mutationFn: verifyTotp, onSuccess: onDone });
  // A QR code only scans as dark on light, so it keeps its own colours
  // instead of the theme's.
  const qr = useMemo(
    () =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        renderSVG(totpURI, { border: 2 }),
      )}`,
    [totpURI],
  );
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    verify.mutate(compactCode(code));
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('settings.security.scanTitle')}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-ui text-small text-text-muted">
          {t('settings.security.scanIntro')}
        </p>
        <img
          src={qr}
          alt={t('settings.security.qrAlt')}
          width={176}
          height={176}
          className="size-44 self-start"
        />
        <p className="font-ui text-small text-text-muted">
          {t('settings.security.secretIntro')}{' '}
          <code
            data-testid="totp-secret"
            className="font-mono break-all text-text"
          >
            {secretOf(totpURI)}
          </code>
        </p>
        <div>
          <h3 className="text-small font-semibold">
            {t('settings.security.backupTitle')}
          </h3>
          <p className="font-ui text-small text-text-muted">
            {t('settings.security.backupIntro')}
          </p>
          <ul
            aria-label={t('settings.security.backupTitle')}
            data-testid="backup-codes"
            className="mt-1 grid grid-cols-2 gap-x-3 text-small"
          >
            {backupCodes.map((backup) => (
              <li key={backup}>{backup}</li>
            ))}
          </ul>
        </div>
        <SecretField
          label={t('settings.security.code')}
          hint={t('settings.security.codeHint')}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={setCode}
          mono
        />
        <FailureLine error={verify.error} />
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('settingsAccount.cancel')}
          </BracketButton>
          <PrimaryButton
            type="submit"
            isDisabled={verify.isPending || code === ''}
          >
            {verify.isPending
              ? t('settings.security.checking')
              : t('settings.security.turnOnSubmit')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}

/** Two-factor status with turn on (password, QR, backup codes, code) and off. */
export function TwoFactorTile({ session }: { session: SessionView }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [status, setStatus] = useState('');
  const enabled = session.user.twoFactorEnabled;
  const close = () => {
    setStep({ kind: 'idle' });
  };
  const finish = (message: string) => async () => {
    await refreshSession(queryClient);
    setStatus(message);
    close();
  };

  const locked = enabled && session.twoFactorEnforced;
  const control = locked ? undefined : (
    <BracketButton
      tone={enabled ? 'destructive' : 'default'}
      onPress={() => {
        setStatus('');
        setStep({ kind: 'password' });
      }}
    >
      {t(
        enabled
          ? 'settingsAccount.twoFactor.turnOff'
          : 'settingsAccount.twoFactor.turnOn',
      )}
    </BracketButton>
  );
  const hint = locked
    ? t('settings.security.enforced')
    : t(
        enabled
          ? 'settings.security.twoFactorOn'
          : 'settings.security.twoFactorOff',
      );

  return (
    <Tile
      title={t('settingsAccount.twoFactor.title')}
      bodyClassName="px-0 pb-0"
    >
      {session.twoFactorRequired ? (
        <Notice role="alert">{t('settingsAccount.twoFactor.required')}</Notice>
      ) : null}
      <SettingRow
        label={t('settingsAccount.twoFactor.status')}
        value={t(enabled ? 'settingsAccount.on' : 'settingsAccount.off')}
        hint={hint}
        control={control}
      />
      <p role="status" className="px-3 py-1 text-small empty:p-0">
        {status}
      </p>
      {step.kind === 'password' ? (
        <PasswordSheet
          enabled={enabled}
          onClose={close}
          onEnrol={(start) => {
            setStep({ kind: 'scan', ...start });
          }}
          onDisabled={() => void finish(t('settings.security.turnedOff'))()}
        />
      ) : null}
      {step.kind === 'scan' ? (
        <ScanSheet
          totpURI={step.totpURI}
          backupCodes={step.backupCodes}
          onClose={close}
          onDone={() => void finish(t('settings.security.turnedOn'))()}
        />
      ) : null}
    </Tile>
  );
}

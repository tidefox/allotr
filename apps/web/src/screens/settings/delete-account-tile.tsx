import type { SessionView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SyntheticEvent } from 'react';
import { BracketButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { deleteUser } from '@/lib/session';
import { t } from '@/messages/t';
import { compactCode } from './account-model.ts';
import {
  BracketLink,
  FailureLine,
  SecretField,
  SettingRow,
} from './settings-parts.tsx';

function DeleteSheet({
  session,
  onClose,
}: {
  session: SessionView;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const twoFactor = session.user.twoFactorEnabled;
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const remove = useMutation({
    mutationFn: (body: { password: string; code?: string }) =>
      deleteUser(queryClient, body),
    onSuccess: () => navigate({ to: '/sign-in', search: { deleted: true } }),
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const compact = compactCode(code);
    remove.mutate({
      password,
      ...(twoFactor && compact !== '' ? { code: compact } : {}),
    });
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
      title={t('settings.deleteAccount.dialogTitle')}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-ui text-small">{t('settings.deleteAccount.what')}</p>
        {/* Held to two-factor enrolment, the user cannot export yet. */}
        {session.twoFactorRequired ? null : (
          <div className="flex flex-col items-start gap-1">
            <p className="font-ui text-small text-text-muted">
              {t('settings.deleteAccount.exportFirst')}
            </p>
            <BracketLink
              download
              href="/v1/export?format=json"
              label={t('settingsData.deleteAccount.exportFirst')}
            />
          </div>
        )}
        <SecretField
          label={t('settings.security.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {twoFactor ? (
          <SecretField
            label={t('settings.security.code')}
            hint={t('settings.deleteAccount.codeHint')}
            name="code"
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
            mono
          />
        ) : null}
        <FailureLine error={remove.error} />
        <div className="flex items-center justify-end gap-2">
          <BracketButton isDisabled={remove.isPending} onPress={onClose}>
            {t('settingsData.cancel')}
          </BracketButton>
          <BracketButton
            type="submit"
            tone="destructive"
            isDisabled={remove.isPending || password === ''}
          >
            {remove.isPending
              ? t('settings.deleteAccount.deleting')
              : t('settings.deleteAccount.confirm')}
          </BracketButton>
        </div>
      </form>
    </Sheet>
  );
}

/** Hard delete of the account and its data, confirmed with the password. */
export function DeleteAccountTile({ session }: { session: SessionView }) {
  const [open, setOpen] = useState(false);
  return (
    <Tile title={t('settings.deleteAccount.title')} bodyClassName="px-0 pb-0">
      <SettingRow
        label={t('settings.deleteAccount.title')}
        hint={t('settings.deleteAccount.intro')}
        control={
          <BracketButton
            tone="destructive"
            onPress={() => {
              setOpen(true);
            }}
          >
            {t('settingsData.deleteAccount.action')}
          </BracketButton>
        }
      />
      {open ? (
        <DeleteSheet
          session={session}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </Tile>
  );
}

import {
  registrationModeSchema,
  type InstanceSettings,
  type InstanceSettingsPatch,
  type RegistrationMode,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { Selection } from 'react-aria-components';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { Sheet } from '@/components/sheet';
import { formatMoment } from '@/features/ledger/format';
import {
  createInvite,
  instanceSettingsQuery,
  sessionQuery,
  updateInstanceSettings,
} from '@/lib/session';
import { t } from '@/messages/t';
import {
  FailureLine,
  Notice,
  SecretField,
  SettingRow,
} from './setting-parts.tsx';

const modes = registrationModeSchema.options;
const lifetimes = [1, 7, 30] as const;

function firstKey(keys: Selection): string | undefined {
  const [first] = keys === 'all' ? [] : [...keys];
  return first === undefined ? undefined : String(first);
}

function useInstanceSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: InstanceSettingsPatch) => updateInstanceSettings(patch),
    onSuccess: async (next) => {
      queryClient.setQueryData(instanceSettingsQuery.queryKey, next);
      // The admin's own session says whether two-factor is enforced and
      // whether themes may be imported from a URL.
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });
}

function OnOffMenu({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <MenuButton
      label={label}
      value={t(checked ? 'settingsAccount.on' : 'settingsAccount.off')}
      selectionMode="single"
      selectedKeys={new Set([checked ? 'on' : 'off'])}
      onSelectionChange={(keys) => {
        const next = firstKey(keys);
        if (next !== undefined && (next === 'on') !== checked)
          onChange(next === 'on');
      }}
    >
      <MenuRadioItem id="on" label={t('settingsAccount.on')} />
      <MenuRadioItem id="off" label={t('settingsAccount.off')} />
    </MenuButton>
  );
}

function InstanceRows({ settings }: { settings: InstanceSettings }) {
  const save = useInstanceSave();
  return (
    <>
      <SettingRow
        label={
          <MenuButton
            label={t('settingsAccount.instance.registration')}
            value={t(`settings.instance.modes.${settings.registrationMode}`)}
            selectionMode="single"
            selectedKeys={new Set([settings.registrationMode])}
            onSelectionChange={(keys) => {
              const next = firstKey(keys);
              const mode = modes.find((m) => m === next);
              if (mode !== undefined && mode !== settings.registrationMode)
                save.mutate({ registrationMode: mode });
            }}
          >
            {modes.map((mode: RegistrationMode) => (
              <MenuRadioItem
                key={mode}
                id={mode}
                label={t(`settings.instance.modes.${mode}`)}
              />
            ))}
          </MenuButton>
        }
        hint={t(`settings.instance.modeHints.${settings.registrationMode}`)}
      />
      <SettingRow
        label={
          <OnOffMenu
            label={t('settingsAccount.instance.twoFactor')}
            checked={settings.requireTwoFactor}
            onChange={(requireTwoFactor) => {
              save.mutate({ requireTwoFactor });
            }}
          />
        }
        hint={t('settingsAccount.instance.twoFactorHint')}
      />
      <SettingRow
        label={
          <OnOffMenu
            label={t('settingsAccount.instance.themeUrl')}
            checked={settings.themeUrlImport}
            onChange={(themeUrlImport) => {
              save.mutate({ themeUrlImport });
            }}
          />
        }
        hint={t('settingsAccount.instance.themeUrlHint')}
      />
      <div className="px-3 empty:hidden">
        <FailureLine error={save.error} />
      </div>
    </>
  );
}

/** Instance-wide settings for administrators; each choice saves at once. */
export function InstanceTile() {
  const settings = useQuery(instanceSettingsQuery);
  return (
    <Tile
      title={t('settingsAccount.instance.title')}
      subtitle={t('settingsAccount.instance.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      {settings.isError ? (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-2 text-small"
        >
          <span className="text-negative">{t('settingsAccount.failed')}</span>
          <BracketButton
            onPress={() => {
              void settings.refetch();
            }}
          >
            {t('settingsAccount.retry')}
          </BracketButton>
        </div>
      ) : settings.data === undefined ? (
        <Notice role="status">{t('settingsAccount.loading')}</Notice>
      ) : (
        <InstanceRows settings={settings.data} />
      )}
    </Tile>
  );
}

function InviteSheet({
  locale,
  timeZone,
  onClose,
}: {
  locale: string;
  timeZone: string;
  onClose: () => void;
}) {
  const [days, setDays] = useState<number>(7);
  const [copied, setCopied] = useState(false);
  const create = useMutation({ mutationFn: createInvite });
  const invite = create.data;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setCopied(false);
    create.mutate(days);
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('settingsAccount.invites.createTitle')}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-ui text-small text-text-muted">
          {t('settings.instance.inviteIntro')}
        </p>
        <MenuButton
          label={t('settingsAccount.invites.lifetime')}
          value={t('settings.instance.days', { count: days })}
          selectionMode="single"
          selectedKeys={new Set([String(days)])}
          onSelectionChange={(keys) => {
            const next = Number(firstKey(keys));
            if (lifetimes.some((n) => n === next)) setDays(next);
          }}
          className="self-start"
        >
          {lifetimes.map((n) => (
            <MenuRadioItem
              key={n}
              id={String(n)}
              label={t('settings.instance.days', { count: n })}
            />
          ))}
        </MenuButton>
        <FailureLine error={create.error} />
        {invite === undefined ? null : (
          <>
            <SecretField
              label={t('settingsAccount.invites.linkField')}
              hint={t('settings.instance.inviteLinkHint', {
                when: formatMoment(invite.expiresAt, locale, timeZone),
              })}
              value={invite.url}
              readOnly
              mono
            />
            <div className="flex items-center gap-3">
              <BracketButton
                onPress={() => {
                  void navigator.clipboard.writeText(invite.url).then(
                    () => {
                      setCopied(true);
                    },
                    () => undefined,
                  );
                }}
              >
                {t('settings.instance.copy')}
              </BracketButton>
              <p role="status" className="text-small text-text-muted">
                {copied ? t('settings.instance.copied') : ''}
              </p>
            </div>
          </>
        )}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t(
              invite === undefined
                ? 'settingsAccount.cancel'
                : 'settingsAccount.invites.done',
            )}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={create.isPending}>
            {create.isPending
              ? t('settingsAccount.invites.creating')
              : t('settingsAccount.invites.submit')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}

/** Single-use invite links. The API has no way to list or revoke them yet. */
export function InvitesTile({
  locale,
  timeZone,
}: {
  locale: string;
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const settings = useQuery(instanceSettingsQuery);
  const mode = settings.data?.registrationMode;
  const hint =
    mode === 'closed'
      ? t('settingsAccount.invites.closed')
      : mode === 'open'
        ? t('settingsAccount.invites.open')
        : t('settingsAccount.invites.empty');
  return (
    <Tile
      title={t('settingsAccount.invites.title')}
      subtitle={t('settingsAccount.invites.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <SettingRow
        label={t('settings.instance.inviteTitle')}
        hint={hint}
        control={
          <BracketButton
            onPress={() => {
              setOpen(true);
            }}
          >
            {t('settingsAccount.invites.create')}
          </BracketButton>
        }
      />
      {open ? (
        <InviteSheet
          locale={locale}
          timeZone={timeZone}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </Tile>
  );
}

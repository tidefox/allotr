import {
  CUSTOM_THEME_LIMIT,
  slotPaletteTheme,
  THEME_MODES,
  THEME_SCHEMES,
  type CustomThemeView,
  type PaletteTheme,
  type ThemeScheme,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { FileTrigger, type Selection } from 'react-aria-components';
import { BracketButton, ToggleGroup } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { EmptyState } from '@/components/states';
import { useTheme } from '@/components/theme-provider';
import { IconDownload2Line } from '@/generated/icons';
import { appearanceQuery, deleteTheme, themesQuery } from '@/lib/appearance';
import { useDevicePref, useEffectiveMotion } from '@/lib/device-prefs';
import { describeProblem } from '@/lib/problem';
import { readShortcutsEnabled, saveShortcutsEnabled } from '@/lib/shortcuts';
import { sessionQuery } from '@/lib/session';
import { t } from '@/messages/t';
import { TextField } from '@/screens/transactions/detail/fields.tsx';
import {
  creditedThemes,
  slotOptions,
  SWATCH_ROLES,
  themeFileName,
  themeFileText,
} from './app-model.ts';
import { BracketLink, SettingRow, Swatches } from './settings-parts.tsx';
import { useThemeImport } from './use-theme-import.ts';

// Settings, App (docs/ui.md §6): the palette for each mode, the user's own
// palettes, and how the interface looks and moves on this device. Fonts,
// tab order, the top bar and layouts are planned (ADR 0029).

function deviceStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function onOff() {
  return [
    { id: 'on' as const, label: t('settingsApp.interface.on') },
    { id: 'off' as const, label: t('settingsApp.interface.off') },
  ];
}

function SlotMenu({
  scheme,
  custom,
}: {
  scheme: ThemeScheme;
  custom: readonly PaletteTheme[];
}) {
  const { appearance, setSlot } = useTheme();
  const current = slotPaletteTheme(appearance[scheme], scheme, custom);
  const label = t(`settingsApp.palette.${scheme}`);
  return (
    <SettingRow label={label}>
      <MenuButton
        label={t('settingsApp.palette.pick', {
          scheme: t(`themes.schemes.${scheme}`),
        })}
        value={current.name}
        title={label}
        selectionMode="single"
        selectedKeys={new Set([current.id])}
        onSelectionChange={(keys: Selection) => {
          const [first] = keys === 'all' ? [] : [...keys];
          if (first !== undefined) setSlot(scheme, String(first));
        }}
      >
        {slotOptions(scheme, custom).map((option) => (
          <MenuRadioItem
            key={option.id}
            id={option.id}
            label={
              option.custom
                ? `${option.name} · ${t('settingsApp.palette.custom')}`
                : option.name
            }
          />
        ))}
      </MenuButton>
    </SettingRow>
  );
}

function PaletteTile({ custom }: { custom: readonly PaletteTheme[] }) {
  const { mode, setMode, appearance, saveError } = useTheme();
  const credited = creditedThemes(appearance, custom);
  return (
    <Tile
      title={t('settingsApp.palette.title')}
      subtitle={t('settingsApp.palette.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <SettingRow
        label={t('settingsApp.palette.mode')}
        hint={t('settingsApp.palette.modeHint')}
      >
        <ToggleGroup
          label={t('settingsApp.palette.mode')}
          options={THEME_MODES.map((id) => ({
            id,
            label: t(`settingsApp.palette.modes.${id}`),
          }))}
          value={mode}
          onChange={setMode}
        />
      </SettingRow>
      {THEME_SCHEMES.map((scheme) => (
        <SlotMenu key={scheme} scheme={scheme} custom={custom} />
      ))}
      {credited.length === 0 ? null : (
        <ul data-testid="theme-credits" className="px-3 py-1">
          {credited.map((theme) =>
            theme.credit === undefined ? null : (
              <li key={theme.id}>
                <a
                  href={theme.credit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-hit items-center font-ui text-tiny text-text-muted underline underline-offset-2"
                >
                  {t('settingsApp.palette.credit', {
                    name: theme.name,
                    author: theme.credit.author,
                    licence: theme.credit.licence,
                  })}
                </a>
              </li>
            ),
          )}
        </ul>
      )}
      {saveError ? (
        <p role="status" className="px-3 py-1 text-small text-negative">
          {t('settingsApp.palette.notSaved')}
        </p>
      ) : null}
    </Tile>
  );
}

const columns: readonly RowColumn[] = [
  { width: 'auto', from: 'wide' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto', from: 'medium' },
  { width: 'auto' },
];

function downloadTheme(theme: CustomThemeView) {
  const blob = new Blob([themeFileText(theme)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = themeFileName(theme.name);
  link.click();
  URL.revokeObjectURL(url);
}

function ThemeRow({
  theme,
  palette,
  onDelete,
}: {
  theme: CustomThemeView;
  palette: PaletteTheme | undefined;
  onDelete: () => void;
}) {
  return (
    <Row
      columns={columns}
      cells={[
        palette === undefined ? null : (
          <Swatches key="s" theme={palette} roles={SWATCH_ROLES} />
        ),
        <span key="n" className="font-ui">
          {theme.name}
        </span>,
        <span key="m" className="text-text-muted">
          {t(`themes.schemes.${theme.scheme}`)}
        </span>,
        <span key="a" className="flex items-center">
          <BracketLink to="/settings/themes/$id" params={{ id: theme.id }}>
            <span aria-hidden="true">{t('settingsApp.themes.edit')}</span>
            <span className="sr-only">
              {t('settingsApp.themes.editLabel', { name: theme.name })}
            </span>
          </BracketLink>
          <BracketButton
            icon={IconDownload2Line}
            aria-label={t('settingsApp.themes.downloadLabel', {
              name: theme.name,
            })}
            onPress={() => {
              downloadTheme(theme);
            }}
          >
            <span aria-hidden="true" className="compact:sr-only">
              {t('settingsApp.themes.download')}
            </span>
          </BracketButton>
          <BracketButton
            tone="destructive"
            aria-label={t('settingsApp.themes.deleteLabel', {
              name: theme.name,
            })}
            onPress={onDelete}
          >
            <span aria-hidden="true">{t('settingsApp.themes.delete')}</span>
          </BracketButton>
        </span>,
      ]}
    />
  );
}

function DeleteSheet({
  theme,
  userId,
  onClose,
  onDeleted,
}: {
  theme: CustomThemeView | null;
  userId: string;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteTheme(id),
    onSuccess: async () => {
      // The server may have moved a slot back to its default.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: themesQuery(userId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: appearanceQuery(userId).queryKey,
        }),
      ]);
      if (theme !== null) onDeleted(theme.name);
      onClose();
    },
  });
  return (
    <Sheet
      isOpen={theme !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset();
          onClose();
        }
      }}
      title={
        theme === null
          ? ''
          : t('settings.appearance.deleteTitle', { name: theme.name })
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <p className="font-ui text-small">
          {t('settings.appearance.deleteBody')}
        </p>
        {remove.isError ? (
          <p role="alert" className="text-small text-negative">
            {describeProblem(remove.error).message}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('settingsApp.themes.cancel')}
          </BracketButton>
          <BracketButton
            tone="destructive"
            isDisabled={remove.isPending}
            onPress={() => {
              if (theme !== null) remove.mutate(theme.id);
            }}
          >
            {remove.isPending
              ? t('settingsApp.themes.deleting')
              : t('settingsApp.themes.confirmDelete')}
          </BracketButton>
        </div>
      </div>
    </Sheet>
  );
}

function ThemesTile({
  userId,
  customThemes,
  customPalettes,
}: {
  userId: string;
  customThemes: readonly CustomThemeView[] | undefined;
  customPalettes: readonly PaletteTheme[];
}) {
  const session = useQuery(sessionQuery).data;
  const custom = customThemes ?? [];
  const full = custom.length >= CUSTOM_THEME_LIMIT;
  const importer = useThemeImport(userId, CUSTOM_THEME_LIMIT - custom.length);
  const [deleting, setDeleting] = useState<CustomThemeView | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [url, setUrl] = useState('');
  const submitUrl = (event: SyntheticEvent) => {
    event.preventDefault();
    if (url.trim() !== '') void importer.fromUrl(url.trim());
  };
  return (
    <Tile
      title={t('settingsApp.themes.title')}
      subtitle={
        customThemes === undefined
          ? undefined
          : t('settingsApp.themes.subtitle', {
              count: custom.length,
              limit: CUSTOM_THEME_LIMIT,
            })
      }
      bodyClassName="px-0 pb-0"
    >
      <p aria-live="polite" className="sr-only">
        {announcement || importer.done}
      </p>
      {customThemes === undefined ? (
        <p role="status" className="px-3 py-2 text-small text-text-muted">
          {t('settingsApp.loading')}
        </p>
      ) : custom.length === 0 ? (
        <EmptyState
          title={t('settings.appearance.noThemes')}
          hint={t('settingsApp.themes.none')}
        />
      ) : (
        <ul>
          {custom.map((theme) => (
            <li key={theme.id}>
              <ThemeRow
                theme={theme}
                palette={customPalettes.find((p) => p.id === theme.id)}
                onDelete={() => {
                  setAnnouncement('');
                  setDeleting(theme);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {full || customThemes === undefined ? null : (
        <div className="flex flex-wrap items-center gap-x-2 px-3 py-1">
          <BracketLink to="/settings/themes/new">
            {t('settingsApp.themes.create')}
          </BracketLink>
          <FileTrigger
            acceptedFileTypes={['.json', '.yaml', '.yml', '.toml', '.txt']}
            onSelect={(files) => {
              const file = files?.[0];
              if (file !== undefined) void importer.fromFile(file);
            }}
          >
            <BracketButton isDisabled={importer.busy}>
              {t('settingsApp.themes.import')}
            </BracketButton>
          </FileTrigger>
        </div>
      )}
      {full || customThemes === undefined ? null : (
        <p className="px-3 pb-1 font-ui text-tiny text-text-muted">
          {t('settings.appearance.importHint')}
        </p>
      )}
      {session?.themeUrlImport === true && !full ? (
        <form
          noValidate
          onSubmit={submitUrl}
          className="flex flex-col gap-1 border-t px-3 py-2"
        >
          <TextField
            label={t('settings.appearance.importUrl')}
            value={url}
            placeholder={t('settingsApp.themes.urlPlaceholder')}
            onChange={setUrl}
          />
          <p className="font-ui text-tiny text-text-muted">
            {t('settings.appearance.importUrlHint')}
          </p>
          <div>
            <BracketButton type="submit" isDisabled={importer.busy}>
              {importer.busy
                ? t('settings.appearance.fetching')
                : t('settingsApp.themes.fetch')}
            </BracketButton>
          </div>
        </form>
      ) : null}
      <div role="alert" data-testid="import-problems">
        {importer.refused === null ? null : (
          <div className="border-t px-3 py-2 text-small">
            <p className="text-negative">
              {t('settings.appearance.importFailed', {
                file: importer.refused.source,
              })}
            </p>
            <ul className="font-ui">
              {importer.refused.problems.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <DeleteSheet
        theme={deleting}
        userId={userId}
        onClose={() => {
          setDeleting(null);
        }}
        onDeleted={(name) => {
          setAnnouncement(t('settings.appearance.deleted', { name }));
        }}
      />
    </Tile>
  );
}

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

function OnOffPref({
  pref,
  label,
  hint,
  disabled = false,
}: {
  pref: 'hints' | 'haptics' | 'celebrations';
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useDevicePref(pref);
  return (
    <SettingRow label={label} hint={hint}>
      {disabled ? (
        <span className="text-small text-text-muted">
          {t('settingsApp.interface.off')}
        </span>
      ) : (
        <ToggleGroup
          label={label}
          options={onOff()}
          value={value}
          onChange={setValue}
        />
      )}
    </SettingRow>
  );
}

function InterfaceTile() {
  const [motion, setMotion] = useDevicePref('motion');
  const [density, setDensity] = useDevicePref('density');
  const [shortcuts, setShortcuts] = useState(() =>
    readShortcutsEnabled(deviceStorage()),
  );
  const still = useEffectiveMotion() !== 'full';
  return (
    <Tile
      title={t('settingsApp.interface.title')}
      subtitle={t('settingsApp.interface.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <SettingRow label={t('settingsApp.interface.density')}>
        <ToggleGroup
          label={t('settingsApp.interface.density')}
          options={(['comfortable', 'compact'] as const).map((id) => ({
            id,
            label: t(`settingsApp.interface.densities.${id}`),
          }))}
          value={density}
          onChange={setDensity}
        />
      </SettingRow>
      <SettingRow label={t('settingsApp.interface.motion')}>
        <ToggleGroup
          label={t('settingsApp.interface.motion')}
          options={(['system', 'full', 'reduced', 'off'] as const).map(
            (id) => ({
              id,
              label: t(`settingsApp.interface.motions.${id}`),
            }),
          )}
          value={motion}
          onChange={setMotion}
        />
      </SettingRow>
      <OnOffPref
        pref="hints"
        label={t('settingsApp.interface.hints')}
        hint={t('settingsApp.interface.hintsHint')}
      />
      <SettingRow
        label={t('settingsApp.interface.shortcuts')}
        hint={t('settings.shortcutsHint')}
      >
        <ToggleGroup
          label={t('settingsApp.interface.shortcuts')}
          options={onOff()}
          value={shortcuts ? 'on' : 'off'}
          onChange={(next) => {
            saveShortcutsEnabled(deviceStorage(), next === 'on');
            setShortcuts(next === 'on');
          }}
        />
      </SettingRow>
      {canVibrate() ? (
        <OnOffPref pref="haptics" label={t('settingsApp.interface.haptics')} />
      ) : null}
      <OnOffPref
        pref="celebrations"
        label={t('settingsApp.interface.celebrations')}
        hint={
          still
            ? t('settingsApp.interface.celebrationsOff')
            : t('settingsApp.interface.celebrationsHint')
        }
        disabled={still}
      />
    </Tile>
  );
}

function PlannedTile() {
  const items = ['fonts', 'tabs', 'topBar', 'layouts'] as const;
  return (
    <Tile
      title={t('settingsApp.planned.title')}
      subtitle={t('settingsApp.planned.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      {items.map((item) => (
        <SettingRow key={item} label={t(`settingsApp.planned.${item}`)}>
          <span className="text-small text-text-muted">
            {t('settingsApp.planned.note')}
          </span>
        </SettingRow>
      ))}
    </Tile>
  );
}

export function AppTab() {
  const { customThemes, customPalettes } = useTheme();
  const session = useQuery(sessionQuery).data;
  return (
    <Grid className="min-h-full content-start">
      <PaletteTile custom={customPalettes} />
      <InterfaceTile />
      <ThemesTile
        userId={session?.user.id ?? ''}
        customThemes={customThemes}
        customPalettes={customPalettes}
      />
      <PlannedTile />
    </Grid>
  );
}

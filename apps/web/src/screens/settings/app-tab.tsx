import {
  CUSTOM_THEME_LIMIT,
  PALETTE_THEMES,
  slotPaletteTheme,
  THEME_MODES,
  type CustomThemeView,
  type PaletteTheme,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Button, FileTrigger } from 'react-aria-components';
import { BracketButton, ToggleGroup } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { useTheme } from '@/components/theme-provider';
import {
  IconCheckboxBlankCircleLine,
  IconDownload2Line,
  IconKeyboardLine,
  IconLayoutGridLine,
  IconPaletteLine,
  IconRadioButtonLine,
} from '@/generated/icons';
import { appearanceQuery, deleteTheme, themesQuery } from '@/lib/appearance';
import { useDevicePref, useEffectiveMotion } from '@/lib/device-prefs';
import { describeProblem } from '@/lib/problem';
import { readShortcutsEnabled, saveShortcutsEnabled } from '@/lib/shortcuts';
import { sessionQuery } from '@/lib/session';
import { t } from '@/messages/t';
import { TextField } from '@/screens/transactions/detail/fields.tsx';
import {
  creditedThemes,
  SWATCH_ROLES,
  themeFileName,
  themeFileText,
} from './app-model.ts';
import {
  BracketLink,
  CheckControl,
  KvList,
  KvRow,
  Swatches,
} from './app-parts.tsx';
import { NotificationsTile } from './notifications-tile.tsx';
import { PlannedTag } from './setting-parts.tsx';
import { useThemeImport } from './use-theme-import.ts';

// Settings, App (docs/ui.md §6): the palette list, then how the interface
// looks and moves on this device. Fonts, tab order, the top bar and layouts
// are planned (ADR 0029) and only noted.

function deviceStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function downloadTheme(theme: CustomThemeView) {
  const blob = new Blob([themeFileText(theme)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = themeFileName(theme.name);
  link.click();
  URL.revokeObjectURL(url);
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

/**
 * One palette: a radio-style row that picks it for its scheme's slot, with
 * the colours of the palette. Your own palettes add edit, download, delete.
 */
function PaletteRow({
  theme,
  selected,
  custom,
  onPick,
  onDelete,
}: {
  theme: PaletteTheme;
  selected: boolean;
  custom: CustomThemeView | undefined;
  onPick: () => void;
  onDelete: () => void;
}) {
  const Radio = selected ? IconRadioButtonLine : IconCheckboxBlankCircleLine;
  return (
    <div className="flex min-h-row items-center border-b">
      <Button
        aria-pressed={selected}
        onPress={onPick}
        className="press grid min-h-row min-w-0 flex-1 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 text-left"
      >
        <Radio aria-hidden="true" className="size-4 text-primary" />
        <span className="min-w-0 truncate font-ui">
          <span>{theme.name}</span>{' '}
          <span className="text-text-muted">
            {t(`themes.schemes.${theme.scheme}`)}
          </span>
          {custom === undefined ? null : (
            <span className="text-text-muted">
              {' · '}
              {t('settingsApp.palette.custom')}
            </span>
          )}
        </span>
        <Swatches theme={theme} roles={SWATCH_ROLES} />
      </Button>
      {custom === undefined ? null : (
        <span className="flex shrink-0 items-center pr-1.5">
          <BracketLink to="/settings/themes/$id" params={{ id: custom.id }}>
            <span aria-hidden="true">{t('settingsApp.themes.edit')}</span>
            <span className="sr-only">
              {t('settingsApp.themes.editLabel', { name: custom.name })}
            </span>
          </BracketLink>
          <BracketButton
            icon={IconDownload2Line}
            aria-label={t('settingsApp.themes.downloadLabel', {
              name: custom.name,
            })}
            onPress={() => {
              downloadTheme(custom);
            }}
          />
          <BracketButton
            tone="destructive"
            aria-label={t('settingsApp.themes.deleteLabel', {
              name: custom.name,
            })}
            onPress={onDelete}
          >
            <span aria-hidden="true">{t('settingsApp.themes.delete')}</span>
          </BracketButton>
        </span>
      )}
    </div>
  );
}

function PaletteTile({
  userId,
  customThemes,
  customPalettes,
}: {
  userId: string;
  customThemes: readonly CustomThemeView[] | undefined;
  customPalettes: readonly PaletteTheme[];
}) {
  const { mode, setMode, appearance, setSlot, saveError } = useTheme();
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
  const credited = creditedThemes(appearance, customPalettes);
  const inUse = new Set(
    (['light', 'dark'] as const).map(
      (scheme) =>
        slotPaletteTheme(appearance[scheme], scheme, customPalettes).id,
    ),
  );
  const themes = [...PALETTE_THEMES, ...customPalettes];
  return (
    <Tile
      title={t('settingsApp.palette.title')}
      icon={IconPaletteLine}
      bodyClassName="px-0 pb-0"
      actions={
        full || customThemes === undefined ? null : (
          <>
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
            <BracketLink to="/settings/themes/new">
              {t('settingsApp.themes.create')}
            </BracketLink>
          </>
        )
      }
    >
      <p aria-live="polite" className="sr-only">
        {announcement || importer.done}
      </p>
      <div className="border-b px-3 py-2">
        <KvList>
          <KvRow label={t('settingsApp.palette.mode')}>
            <ToggleGroup
              label={t('settingsApp.palette.mode')}
              options={THEME_MODES.map((id) => ({
                id,
                label: t(`settingsApp.palette.modes.${id}`),
              }))}
              value={mode}
              onChange={setMode}
            />
          </KvRow>
        </KvList>
      </div>
      <div role="group" aria-label={t('settingsApp.palette.list')}>
        {themes.map((theme) => (
          <PaletteRow
            key={theme.id}
            theme={theme}
            selected={inUse.has(theme.id)}
            custom={custom.find((c) => c.id === theme.id)}
            onPick={() => {
              setSlot(theme.scheme, theme.id);
            }}
            onDelete={() => {
              setAnnouncement('');
              setDeleting(custom.find((c) => c.id === theme.id) ?? null);
            }}
          />
        ))}
      </div>
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
      {full || customThemes === undefined ? null : (
        <p className="px-3 py-2 font-ui text-tiny text-text-muted">
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

function PrefCheck({
  pref,
  label,
  disabled = false,
}: {
  pref: 'hints' | 'haptics' | 'celebrations';
  label: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useDevicePref(pref);
  return (
    <KvRow label={label}>
      {disabled ? (
        <span className="text-text-muted">
          {t('settingsApp.interface.off')}
        </span>
      ) : (
        <CheckControl
          label={label}
          text={t('settingsApp.interface.show')}
          checked={value === 'on'}
          onChange={(on) => {
            setValue(on ? 'on' : 'off');
          }}
        />
      )}
    </KvRow>
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
    <Tile title={t('settingsApp.interface.title')} icon={IconKeyboardLine}>
      <KvList>
        <KvRow label={t('settingsApp.interface.density')}>
          <ToggleGroup
            label={t('settingsApp.interface.density')}
            options={(['compact', 'comfortable'] as const).map((id) => ({
              id,
              label: t(`settingsApp.interface.densities.${id}`),
            }))}
            value={density}
            onChange={setDensity}
          />
        </KvRow>
        <KvRow
          label={t('settingsApp.interface.textFont')}
          tag={<PlannedTag />}
        />
        <KvRow
          label={t('settingsApp.interface.numberFont')}
          tag={<PlannedTag />}
        />
        <KvRow label={t('settingsApp.interface.motion')}>
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
        </KvRow>
        <PrefCheck pref="hints" label={t('settingsApp.interface.hints')} />
        <KvRow label={t('settingsApp.interface.shortcuts')}>
          <CheckControl
            label={t('settingsApp.interface.shortcuts')}
            text={t('settingsApp.interface.on')}
            checked={shortcuts}
            onChange={(on) => {
              saveShortcutsEnabled(deviceStorage(), on);
              setShortcuts(on);
            }}
          />
        </KvRow>
        {canVibrate() ? (
          <PrefCheck
            pref="haptics"
            label={t('settingsApp.interface.haptics')}
          />
        ) : null}
        <PrefCheck
          pref="celebrations"
          label={t('settingsApp.interface.celebrations')}
          disabled={still}
        />
      </KvList>
    </Tile>
  );
}

/** A tile for something planned (ADR 0029): the title says so, nothing else. */
function PlannedTile({ item }: { item: 'tabs' | 'topBar' | 'layouts' }) {
  return (
    <Tile
      title={t(`settingsApp.planned.${item}`)}
      icon={item === 'tabs' ? IconLayoutGridLine : undefined}
      subtitle={t('settingsApp.planned.title')}
    >
      <p className="font-ui text-text-muted">
        {t(`settingsApp.planned.${item}Note`)}
      </p>
    </Tile>
  );
}

export function AppTab() {
  const { customThemes, customPalettes } = useTheme();
  const session = useQuery(sessionQuery).data;
  return (
    <Grid columns={2} className="min-h-full content-start">
      <PaletteTile
        userId={session?.user.id ?? ''}
        customThemes={customThemes}
        customPalettes={customPalettes}
      />
      <div className="flex min-w-0 flex-col">
        <PlannedTile item="tabs" />
        <PlannedTile item="topBar" />
        <PlannedTile item="layouts" />
        <InterfaceTile />
        <NotificationsTile />
      </div>
    </Grid>
  );
}

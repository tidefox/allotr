import {
  ACCENT_LIMIT,
  CANONICAL_HUES,
  DEFAULT_PALETTE_THEME_ID,
  formatContrastRatio,
  NEUTRAL_SLOTS,
  PALETTE_THEMES,
  THEME_SCHEMES,
  type CustomThemeView,
  type PaletteTheme,
  type ResolvedTheme,
  type Role,
  type ThemeBodyV2,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  Input,
  TextField as AriaTextField,
  ToggleButton,
  Text,
  type Selection,
} from 'react-aria-components';
import {
  BracketButton,
  PrimaryButton,
  Tag,
  ToggleGroup,
} from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { MenuButton, MenuItem, MenuRadioItem } from '@/components/menu';
import { EmptyState } from '@/components/states';
import { useTheme } from '@/components/theme-provider';
import {
  checkDraft,
  draftFrom,
  NOTICEABLE_DELTA_L,
  pickerValue,
  roleEntry,
  withAccentName,
  withNewAccent,
  withoutAccent,
  withRole,
  type DraftCheck,
  type ThemeDraft,
} from '@/features/themes/draft';
import { clearDraft, peekDraft } from '@/features/themes/import-handoff';
import { failureText, ROLE_GROUPS, roleLabel } from '@/features/themes/labels';
import { IconCheckLine, IconPaletteLine } from '@/generated/icons';
import {
  appearanceQuery,
  createTheme,
  themesQuery,
  updateTheme,
} from '@/lib/appearance';
import { describeProblem } from '@/lib/problem';
import { sessionQuery } from '@/lib/session';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  TextField,
  ChoiceField,
} from '@/screens/transactions/detail/fields.tsx';
import { BracketLink, Swatch, SettingRow } from './app-parts.tsx';
import {
  blockedReason,
  colorChoices,
  contrastVerdict,
  isContentRole,
  roleRatios,
  roleSlotChoices,
  slotChoices,
} from './theme-editor-model.ts';
import { ThemePreview } from './theme-preview.tsx';

// The theme editor (ADR 0016, docs/ui.md §6) for /settings/themes/new and
// /settings/themes/$id: the palette (neutral ramp, named accents, which
// accent plays each hue), which palette colour each role takes and whether
// it may be adjusted for contrast, beside a live preview. The resolver fits
// every role it may; what it cannot fit is listed with where in the theme
// file it comes from, and blocks saving. Colours are typed as hex, with an
// in-app menu to take one from the palette.

function HexField({
  label,
  value,
  bad,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  bad: boolean;
  choices: readonly { id: string; name: string; color: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <Swatch color={pickerValue(value)} />
        <AriaTextField
          aria-label={t('themeEditor.hexLabel', { name: label })}
          value={value}
          onChange={(next) => {
            onChange(next.trim());
          }}
          isInvalid={bad}
          className="flex"
        >
          <Input
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={7}
            className="h-8 w-[5.5rem] border border-outline bg-canvas px-2 text-small text-text aria-[invalid=true]:border-negative"
          />
          {bad ? (
            <Text slot="errorMessage" className="sr-only">
              {t('themes.badHex')}
            </Text>
          ) : null}
        </AriaTextField>
        <MenuButton
          iconOnly
          icon={IconPaletteLine}
          label={t('themeEditor.fromPalette', { name: label })}
          title={t('themeEditor.fromPaletteTitle')}
        >
          {choices.map((choice) => (
            <MenuItem
              key={choice.id}
              id={choice.id}
              label={t('themeEditor.colourChoice', {
                name: choice.name,
                color: choice.color,
              })}
              onAction={() => {
                onChange(choice.color);
              }}
            />
          ))}
        </MenuButton>
      </div>
      {bad ? (
        <p aria-hidden="true" className="text-tiny text-negative">
          {t('themes.badHex')}
        </p>
      ) : null}
    </div>
  );
}

function NeutralsTile({
  draft,
  check,
  onChange,
}: {
  draft: ThemeDraft;
  check: DraftCheck;
  onChange: (next: ThemeDraft) => void;
}) {
  const choices = colorChoices(draft);
  return (
    <Tile
      title={t('themeEditor.neutrals.title')}
      subtitle={t('themeEditor.neutrals.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <p className="px-3 py-1 font-ui text-tiny text-text-muted">
        {t('themes.neutralsHint')}
      </p>
      <div
        aria-hidden="true"
        data-testid="neutral-strip"
        className="mx-3 mb-1 flex h-5 border border-outline-variant"
      >
        {NEUTRAL_SLOTS.map((slot) => (
          <span
            key={slot}
            className="flex-1"
            style={{ backgroundColor: pickerValue(draft.neutrals[slot]) }}
          />
        ))}
      </div>
      {NEUTRAL_SLOTS.map((slot) => (
        <SettingRow key={slot} label={slot}>
          <HexField
            label={slot}
            value={draft.neutrals[slot]}
            bad={check.badNeutrals.includes(slot)}
            choices={choices}
            onChange={(value) => {
              onChange({
                ...draft,
                neutrals: { ...draft.neutrals, [slot]: value },
              });
            }}
          />
        </SettingRow>
      ))}
    </Tile>
  );
}

function AccentsTile({
  draft,
  check,
  onChange,
}: {
  draft: ThemeDraft;
  check: DraftCheck;
  onChange: (next: ThemeDraft) => void;
}) {
  const choices = colorChoices(draft);
  const added = withNewAccent(draft);
  return (
    <Tile
      title={t('themeEditor.accents.title')}
      subtitle={t('themeEditor.accents.subtitle', { limit: ACCENT_LIMIT })}
      bodyClassName="px-0 pb-0"
      actions={
        added === undefined ? undefined : (
          <BracketButton
            onPress={() => {
              onChange(added);
            }}
          >
            {t('themeEditor.addAccent')}
          </BracketButton>
        )
      }
    >
      <p className="px-3 py-1 font-ui text-tiny text-text-muted">
        {t('themes.accentsHint', { limit: ACCENT_LIMIT })}
      </p>
      {draft.accents.map((accent) => {
        const badName = check.badAccentNames.includes(accent.key);
        return (
          <div
            key={accent.key}
            className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b px-3 py-1"
          >
            <AriaTextField
              aria-label={t('themes.accentName')}
              value={accent.name}
              onChange={(next) => {
                onChange(
                  withAccentName(draft, accent.key, next.trim().toLowerCase()),
                );
              }}
              isInvalid={badName}
              className="flex flex-col gap-0.5"
            >
              <Input
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                maxLength={24}
                className="h-8 w-32 border border-outline bg-canvas px-2 text-small text-text aria-[invalid=true]:border-negative"
              />
              {badName ? (
                <Text slot="errorMessage" className="text-tiny text-negative">
                  {t('themes.badAccentName')}
                </Text>
              ) : null}
            </AriaTextField>
            <HexField
              label={accent.name}
              value={accent.color}
              bad={check.badAccentColors.includes(accent.key)}
              choices={choices}
              onChange={(color) => {
                onChange({
                  ...draft,
                  accents: draft.accents.map((a) =>
                    a.key === accent.key ? { ...a, color } : a,
                  ),
                });
              }}
            />
            <BracketButton
              tone="destructive"
              isDisabled={draft.accents.length <= 1}
              aria-label={t('themes.removeAccent', { name: accent.name })}
              onPress={() => {
                onChange(withoutAccent(draft, accent.key));
              }}
            >
              <span aria-hidden="true">{t('themeEditor.removeAccent')}</span>
            </BracketButton>
          </div>
        );
      })}
    </Tile>
  );
}

function HuesTile({
  draft,
  onChange,
}: {
  draft: ThemeDraft;
  onChange: (next: ThemeDraft) => void;
}) {
  return (
    <Tile
      title={t('themeEditor.hues.title')}
      subtitle={t('themeEditor.hues.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <p className="px-3 py-1 font-ui text-tiny text-text-muted">
        {t('themes.huesHint')}
      </p>
      {CANONICAL_HUES.map((hue) => (
        <SettingRow key={hue} label={t(`themes.hueNames.${hue}`)}>
          <MenuButton
            label={t(`themes.hueNames.${hue}`)}
            value={draft.hues[hue]}
            selectionMode="single"
            selectedKeys={new Set([draft.hues[hue]])}
            onSelectionChange={(keys: Selection) => {
              const [first] = keys === 'all' ? [] : [...keys];
              if (first !== undefined)
                onChange({
                  ...draft,
                  hues: { ...draft.hues, [hue]: String(first) },
                });
            }}
          >
            {draft.accents.map((accent) => (
              <MenuRadioItem
                key={accent.key}
                id={accent.name}
                label={accent.name}
              />
            ))}
          </MenuButton>
        </SettingRow>
      ))}
    </Tile>
  );
}

function FitToggle({
  role,
  checked,
  onChange,
}: {
  role: Role;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <ToggleButton
      isSelected={checked}
      onChange={onChange}
      aria-label={t('themes.fit', { role: roleLabel(role) })}
      className="press inline-flex min-h-hit min-w-hit items-center gap-1 px-1 text-small"
    >
      {({ isSelected }) => (
        <>
          <span
            className={cn(
              'flex size-4 items-center justify-center border border-outline',
              isSelected && 'bg-primary text-on-primary',
            )}
          >
            {isSelected ? <IconCheckLine className="size-3" /> : null}
          </span>
          <span aria-hidden="true">{t('themeEditor.fit')}</span>
        </>
      )}
    </ToggleButton>
  );
}

function RoleRow({
  role,
  draft,
  resolved,
  slots,
  onChange,
}: {
  role: Role;
  draft: ThemeDraft;
  resolved: ResolvedTheme;
  slots: readonly string[];
  onChange: (next: ThemeDraft) => void;
}) {
  const entry = roleEntry(draft, role);
  const fit = resolved.fitted[role];
  const label = roleLabel(role);
  const ratios = roleRatios(role, resolved);
  return (
    <li
      data-role={role}
      aria-label={label}
      className="flex flex-col gap-0.5 border-b px-3 py-1"
    >
      <div className="flex min-h-row flex-wrap items-center gap-x-2 gap-y-1">
        <span
          data-testid={fit === undefined ? undefined : 'split-swatch'}
          className="flex shrink-0"
        >
          {fit === undefined ? null : <Swatch color={fit.from} />}
          <Swatch
            color={resolved.roles[role]}
            className={fit === undefined ? '' : '-ml-px'}
          />
        </span>
        <span className="min-w-24 flex-1 truncate text-small">{label}</span>
        <MenuButton
          label={t('themeEditor.slotFrom')}
          value={entry.slot}
          title={t('themes.slot', { role: label })}
          selectionMode="single"
          selectedKeys={new Set([entry.slot])}
          onSelectionChange={(keys: Selection) => {
            const [first] = keys === 'all' ? [] : [...keys];
            if (first !== undefined)
              onChange(
                withRole(draft, role, { ...entry, slot: String(first) }),
              );
          }}
        >
          {roleSlotChoices(slots, entry.slot).map((slot) => (
            <MenuRadioItem key={slot} id={slot} label={slot} />
          ))}
        </MenuButton>
        {isContentRole(role) ? (
          <FitToggle
            role={role}
            checked={entry.fit !== 'off'}
            onChange={(on) => {
              onChange(
                withRole(draft, role, { ...entry, fit: on ? 'auto' : 'off' }),
              );
            }}
          />
        ) : null}
        {draft.roles[role] === undefined ? null : (
          <BracketButton
            aria-label={t('themes.reset', { role: label })}
            onPress={() => {
              onChange(withRole(draft, role, undefined));
            }}
          >
            <span aria-hidden="true">{t('themeEditor.reset')}</span>
          </BracketButton>
        )}
      </div>
      {fit === undefined ? null : (
        <p className="text-tiny text-text-muted">
          {t('themes.fitted', {
            from: fit.from,
            to: fit.to,
            delta: fit.deltaL.toPrecision(2),
          })}
          {fit.deltaL >= NOTICEABLE_DELTA_L ? (
            <span className="block text-text">{t('themes.noticeable')}</span>
          ) : null}
        </p>
      )}
      {ratios.length === 0 ? null : (
        <ul className="flex flex-wrap gap-1 pb-0.5">
          {ratios.map(({ surface, ratio, pass }) => (
            <li key={surface}>
              <Tag tone={pass ? 'positive' : 'negative'}>
                <span aria-hidden="true">{pass ? '✓ ' : '✗ '}</span>
                {t('themes.ratioOn', {
                  ratio: formatContrastRatio(ratio),
                  surface: roleLabel(surface),
                })}
                <span className="sr-only">
                  {' '}
                  {pass ? t('themes.ratioPass') : t('themes.ratioFail')}
                </span>
              </Tag>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function RoleGroupTile({
  group,
  roles,
  draft,
  resolved,
  onChange,
}: {
  group: (typeof ROLE_GROUPS)[number][0];
  roles: readonly Role[];
  draft: ThemeDraft;
  resolved: ResolvedTheme | null;
  onChange: (next: ThemeDraft) => void;
}) {
  const slots = slotChoices(draft);
  return (
    <Tile
      title={t(`themes.groups.${group}`)}
      subtitle={t('themes.tabs.roles')}
      bodyClassName="px-0 pb-0"
    >
      {resolved === null ? (
        <p className="px-3 py-2 text-small text-text-muted">
          {t('themes.fixPalette')}
        </p>
      ) : (
        <ul>
          {roles.map((role) => (
            <RoleRow
              key={role}
              role={role}
              draft={draft}
              resolved={resolved}
              slots={slots}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </Tile>
  );
}

function ContrastTile({ check }: { check: DraftCheck }) {
  const verdict = contrastVerdict(check);
  const summary =
    verdict.kind === 'invalid'
      ? t('themes.fixPalette')
      : verdict.kind === 'failing'
        ? t('themes.failing', { count: verdict.count })
        : verdict.kind === 'pass'
          ? t('themes.allPass')
          : `${t('themes.allPass')} ${t('themes.adjusted', { count: verdict.count })}`;
  const bad = verdict.kind === 'invalid' || verdict.kind === 'failing';
  return (
    <Tile title={t('themeEditor.contrast.title')}>
      {/* Only the summary is announced, not every role on every change. */}
      <p aria-live="polite" className="sr-only">
        {summary}
      </p>
      <p
        data-testid="contrast-summary"
        className={cn(
          'py-2 font-ui text-small',
          bad ? 'text-negative' : 'text-text',
        )}
      >
        {summary}
      </p>
      {check.problems.length > 0 ? (
        <ul data-testid="contrast-failures" className="pb-2 text-small">
          {check.problems.map(({ path, failure }) => (
            <li
              key={`${path}-${failure.role}-${failure.reason === 'contrast' ? failure.surface : failure.slot}`}
            >
              <code className="text-text-muted">{path}</code>{' '}
              <span className="font-ui">{failureText(failure)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Tile>
  );
}

type Start = Pick<
  PaletteTheme,
  'id' | 'name' | 'scheme' | 'family' | 'palette' | 'roles'
>;

function ThemeEditor({
  userId,
  initial,
  editing,
  starts,
  startId,
}: {
  userId: string;
  initial: ThemeDraft;
  editing?: CustomThemeView | undefined;
  starts: readonly Start[];
  startId?: string | undefined;
}) {
  const [draft, setDraft] = useState(initial);
  const [start, setStart] = useState(startId ?? '');
  const [attempted, setAttempted] = useState(false);
  const check = checkDraft(draft);
  const { setSlot } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: (body: ThemeBodyV2) =>
      editing === undefined ? createTheme(body) : updateTheme(editing.id, body),
    onSuccess: async () => {
      // A scheme change can move the theme out of its slot on the server.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: themesQuery(userId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: appearanceQuery(userId).queryKey,
        }),
      ]);
    },
  });
  const problem = save.isError ? describeProblem(save.error) : null;

  function change(next: ThemeDraft) {
    setDraft(next);
    if (save.isError) save.reset();
  }

  // Saving is refused here, not by disabling the buttons, so the reason is
  // given where the person looks.
  function submit(use: boolean) {
    setAttempted(true);
    if (check.body === null) return;
    save.mutate(check.body, {
      onSuccess: (theme) => {
        if (use) setSlot(theme.scheme, theme.id);
        void navigate({ to: '/settings/$sub', params: { sub: 'app' } });
      },
    });
  }

  const reason = blockedReason(check);
  const blocked =
    !attempted || reason === null
      ? null
      : reason === 'name'
        ? t('themes.nameRequired')
        : reason === 'palette'
          ? t('themes.fixPalette')
          : t('themes.fixFirst');
  const message = blocked ?? problem?.message;
  const busy = save.isPending;

  return (
    <form
      noValidate
      aria-label={
        editing === undefined ? t('themes.newTitle') : t('themes.editTitle')
      }
      onSubmit={(event: SyntheticEvent) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <Grid className="min-h-full content-start">
        <Tile
          title={t('themeEditor.theme.title')}
          subtitle={
            editing === undefined ? t('themes.newTitle') : t('themes.editTitle')
          }
          bodyClassName="flex flex-col gap-3 py-3"
        >
          <p className="font-ui text-small text-text-muted">
            {t('themes.intro')}
          </p>
          <TextField
            label={t('themes.name')}
            value={draft.name}
            error={
              attempted && check.nameError
                ? t('themes.nameRequired')
                : undefined
            }
            onChange={(name) => {
              change({ ...draft, name });
            }}
          />
          {editing === undefined && starts.length > 0 ? (
            <ChoiceField
              label={t('themes.startFrom')}
              value={start}
              placeholder={t('themes.startFrom')}
              choices={starts.map((theme) => ({
                id: theme.id,
                label: `${theme.name} (${t(`themes.schemes.${theme.scheme}`)})`,
              }))}
              onChange={(id) => {
                const theme = starts.find((s) => s.id === id);
                setStart(id);
                if (theme !== undefined) change(draftFrom(theme, draft.name));
              }}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small text-text-muted">
              {t('themes.scheme')}
            </span>
            <ToggleGroup
              label={t('themes.scheme')}
              options={THEME_SCHEMES.map((id) => ({
                id,
                label: t(`themes.schemes.${id}`),
              }))}
              value={draft.scheme}
              onChange={(scheme) => {
                change({ ...draft, scheme });
              }}
            />
          </div>
        </Tile>
        <Tile
          title={t('themeEditor.preview.title')}
          subtitle={t('themeEditor.preview.subtitle')}
          bodyClassName="flex flex-col gap-3 py-3"
        >
          {check.resolved === null ? (
            <p className="font-ui text-small text-text-muted">
              {t('themes.fixPalette')}
            </p>
          ) : (
            <ThemePreview roles={check.resolved.roles} testId="theme-preview" />
          )}
          {message === undefined ? null : (
            <p role="alert" className="text-small text-negative">
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton type="submit" isDisabled={busy}>
              {busy ? t('themeEditor.saving') : t('themeEditor.save')}
            </PrimaryButton>
            <BracketButton
              isDisabled={busy}
              onPress={() => {
                submit(true);
              }}
            >
              {t('themeEditor.saveAndUse')}
            </BracketButton>
            <BracketLink to="/settings/$sub" params={{ sub: 'app' }}>
              {t('themeEditor.cancel')}
            </BracketLink>
          </div>
        </Tile>
        <ContrastTile check={check} />
        <NeutralsTile draft={draft} check={check} onChange={change} />
        <AccentsTile draft={draft} check={check} onChange={change} />
        <HuesTile draft={draft} onChange={change} />
        {ROLE_GROUPS.map(([group, roles]) => (
          <RoleGroupTile
            key={group}
            group={group}
            roles={roles}
            draft={draft}
            resolved={check.resolved}
            onChange={change}
          />
        ))}
      </Grid>
    </form>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <Grid className="min-h-full content-start">
      <Tile title={t('themes.editTitle')} span="full">
        <p role="status" className="py-2 text-small text-text-muted">
          {children}
        </p>
      </Tile>
    </Grid>
  );
}

// A new theme starts from an imported palette, a shipped or custom theme
// (`?from=` is not routed yet), or by default the one in use for the light slot.
function NewTheme({ userId }: { userId: string }) {
  const { customPalettes, customThemes, appearance } = useTheme();
  const [imported] = useState(peekDraft);
  useEffect(clearDraft, []);
  if (customThemes === undefined)
    return <Notice>{t('themeEditor.loading')}</Notice>;
  const starts = [...PALETTE_THEMES, ...customPalettes];
  const start =
    starts.find((theme) => theme.id === appearance.light) ??
    starts.find((theme) => theme.id === DEFAULT_PALETTE_THEME_ID.light);
  if (start === undefined) return <Notice>{t('themeEditor.notFound')}</Notice>;
  return (
    <ThemeEditor
      userId={userId}
      initial={imported ?? draftFrom(start)}
      starts={starts}
      startId={imported === undefined ? start.id : undefined}
    />
  );
}

function EditTheme({ userId, id }: { userId: string; id: string }) {
  const { customThemes } = useTheme();
  if (customThemes === undefined)
    return <Notice>{t('themeEditor.loading')}</Notice>;
  const theme = customThemes.find((custom) => custom.id === id);
  if (theme === undefined)
    return (
      <Grid className="min-h-full content-start">
        <Tile title={t('themes.editTitle')} span="full">
          <EmptyState
            title={t('themeEditor.notFound')}
            hint={t('themes.notFound')}
            action={
              <BracketLink to="/settings/$sub" params={{ sub: 'app' }}>
                {t('themeEditor.back')}
              </BracketLink>
            }
          />
        </Tile>
      </Grid>
    );
  return (
    <ThemeEditor
      key={theme.id}
      userId={userId}
      initial={draftFrom(theme, theme.name)}
      editing={theme}
      starts={[]}
    />
  );
}

/** `/settings/themes/new` (no id) and `/settings/themes/$id`. */
export function ThemeEditorScreen({ id }: { id?: string }) {
  const session = useQuery(sessionQuery).data;
  if (session === undefined || session === null)
    return <Notice>{t('themeEditor.loading')}</Notice>;
  return id === undefined ? (
    <NewTheme userId={session.user.id} />
  ) : (
    <EditTheme userId={session.user.id} id={id} />
  );
}

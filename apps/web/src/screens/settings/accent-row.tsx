import {
  CANONICAL_HUES,
  slotColor,
  slotPaletteTheme,
  themeSetsAccent,
  type Accent,
  type Appearance,
  type PaletteTheme,
  type ThemeScheme,
} from '@allotr/shared';
import { useState } from 'react';
import {
  Input,
  RadioButton,
  RadioField,
  RadioGroup,
  Text,
  TextField as AriaTextField,
} from 'react-aria-components';
import { t } from '@/messages/t';
import { cn } from '@/lib/utils';
import { pickerValue } from '@/features/themes/draft.ts';
import { Swatch } from './app-parts.tsx';

// The accent: which colour of the palette carries the interface (buttons,
// the active tab, the focus ring, the figure on the dashboard), or any hex.
// It is kept on this device. A palette that sets its own accent keeps it;
// the choice is then shown but does not apply (shared/theme/accent.ts).

const choice =
  'press flex size-hit cursor-pointer items-center justify-center border-2 border-outline-variant selected:border-primary';

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

function Option({
  value,
  label,
  wide = false,
  children,
}: {
  value: string;
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <RadioField value={value} aria-label={label} className="contents">
      <RadioButton className={cn(choice, wide && 'w-auto px-2 text-small')}>
        {children}
      </RadioButton>
    </RadioField>
  );
}

export function AccentRow({
  accent,
  onChange,
  appearance,
  customPalettes,
  scheme,
}: {
  accent: Accent;
  onChange: (accent: Accent) => void;
  appearance: Appearance;
  customPalettes: readonly PaletteTheme[];
  /** The scheme on screen, whose palette the swatches show. */
  scheme: ThemeScheme;
}) {
  const theme = slotPaletteTheme(appearance[scheme], scheme, customPalettes);
  const own = themeSetsAccent(theme);
  const custom = accent.startsWith('#');
  const [draft, setDraft] = useState(custom ? accent : '');
  const bad = draft !== '' && !HEX.test(draft);
  return (
    <div className="flex flex-col gap-1 pt-2">
      <RadioGroup
        aria-label={t('settingsApp.palette.accent.label')}
        orientation="horizontal"
        isDisabled={own}
        value={custom ? 'custom' : accent}
        onChange={(next) => {
          if (next === 'custom') {
            if (HEX.test(draft)) onChange(draft);
          } else {
            onChange(next);
          }
        }}
        className="flex flex-col gap-1"
      >
        <span className="text-small text-text-muted">
          {t('settingsApp.palette.accent.label')}
        </span>
        <div className="flex flex-wrap gap-1">
          <Option
            value="auto"
            wide
            label={t('settingsApp.palette.accent.auto')}
          >
            {t('settingsApp.palette.accent.auto')}
          </Option>
          {CANONICAL_HUES.map((hue) => (
            <Option
              key={hue}
              value={hue}
              label={t('settingsApp.palette.accent.hue', {
                hue: t(`settingsApp.palette.accent.hues.${hue}`),
              })}
            >
              <span
                aria-hidden="true"
                className="size-4"
                style={{
                  backgroundColor: slotColor(theme.palette, hue) ?? 'gray',
                }}
              />
            </Option>
          ))}
          <Option
            value="custom"
            wide
            label={t('settingsApp.palette.accent.custom')}
          >
            {custom ? (
              <Swatch color={pickerValue(accent)} />
            ) : (
              t('settingsApp.palette.accent.custom')
            )}
          </Option>
        </div>
      </RadioGroup>
      <div className="flex items-center gap-1">
        <Swatch color={HEX.test(draft) ? pickerValue(draft) : 'transparent'} />
        <AriaTextField
          aria-label={t('settingsApp.palette.accent.hex')}
          value={draft}
          isDisabled={own}
          isInvalid={bad}
          onChange={(next) => {
            const value = next.trim();
            setDraft(value);
            if (HEX.test(value)) onChange(value);
          }}
          className="flex"
        >
          <Input
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={7}
            placeholder="#rrggbb"
            className="h-8 w-[5.5rem] border border-outline bg-canvas px-2 text-small text-text aria-[invalid=true]:border-negative"
          />
          {bad ? (
            <Text slot="errorMessage" className="sr-only">
              {t('themes.badHex')}
            </Text>
          ) : null}
        </AriaTextField>
        {bad ? (
          <span aria-hidden="true" className="text-tiny text-negative">
            {t('themes.badHex')}
          </span>
        ) : null}
      </div>
      <p className="font-ui text-tiny text-text-muted">
        {own
          ? t('settingsApp.palette.accent.own')
          : t('settingsApp.palette.accent.hint')}
      </p>
    </div>
  );
}

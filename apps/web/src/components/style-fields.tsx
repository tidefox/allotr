import { RadioButton, RadioField, RadioGroup } from 'react-aria-components';
import {
  categoryColours,
  categoryIcons,
  type CategoryColour,
  type CategoryIcon as CategoryIconKey,
} from '@allotr/shared';
import { categoryIconComponents } from '@/generated/icons';
import { colourVar, iconLabel } from '@/lib/category-style';
import { t } from '@/messages/t';
import { cn } from '@/lib/utils';

// The colour and icon pickers of every style form (categories, pools,
// accounts): a radio group of swatches, "Auto" first. A colour is a chart
// series role, never a hex value; the icon is a key from the fixed set.

const swatch =
  'press flex size-hit cursor-pointer items-center justify-center border-2 border-outline-variant selected:border-primary';

/** One choice of a swatch group: a labelled radio drawn as a bordered box. */
function Choice({
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
      <RadioButton className={cn(swatch, wide && 'w-auto px-2 text-small')}>
        {children}
      </RadioButton>
    </RadioField>
  );
}

export function ColourField({
  value,
  onChange,
}: {
  value: CategoryColour | null;
  onChange: (value: CategoryColour | null) => void;
}) {
  return (
    <RadioGroup
      aria-label={t('settingsCategories.style.colour')}
      orientation="horizontal"
      value={value ?? 'auto'}
      onChange={(next) => {
        onChange(next === 'auto' ? null : (next as CategoryColour));
      }}
      className="flex flex-col gap-1"
    >
      <span className="text-small text-text-muted">
        {t('settingsCategories.style.colour')}
      </span>
      <div className="flex flex-wrap gap-1">
        <Choice
          value="auto"
          wide
          label={t('settingsCategories.style.automatic')}
        >
          {t('settingsCategories.style.automatic')}
        </Choice>
        {categoryColours.map((colour, index) => (
          <Choice
            key={colour}
            value={colour}
            label={t('settingsCategories.style.colourOption', {
              number: index + 1,
            })}
          >
            <span
              aria-hidden="true"
              className="size-4"
              style={{ backgroundColor: colourVar(colour) }}
            />
          </Choice>
        ))}
      </div>
    </RadioGroup>
  );
}

export function IconField({
  value,
  colour,
  onChange,
}: {
  value: CategoryIconKey | null;
  colour: CategoryColour | null;
  onChange: (value: CategoryIconKey | null) => void;
}) {
  return (
    <RadioGroup
      aria-label={t('settingsCategories.style.icon')}
      orientation="horizontal"
      value={value ?? 'none'}
      onChange={(next) => {
        onChange(next === 'none' ? null : (next as CategoryIconKey));
      }}
      className="flex flex-col gap-1"
    >
      <span className="text-small text-text-muted">
        {t('settingsCategories.style.icon')}
      </span>
      <div className="flex flex-wrap gap-1">
        <Choice value="none" wide label={t('settingsCategories.style.noIcon')}>
          {t('settingsCategories.style.noIcon')}
        </Choice>
        {categoryIcons.map((icon) => {
          const Icon = categoryIconComponents[icon];
          return (
            <Choice key={icon} value={icon} label={iconLabel(icon)}>
              <Icon
                aria-hidden="true"
                className="size-4"
                style={{
                  color: colour === null ? 'var(--text)' : colourVar(colour),
                }}
              />
            </Choice>
          );
        })}
      </div>
    </RadioGroup>
  );
}

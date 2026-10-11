import type { ComponentType, ReactNode } from 'react';
import {
  Button,
  ToggleButton,
  ToggleButtonGroup,
  type ButtonProps,
} from 'react-aria-components';
import type { IconProps } from '@/generated/icons';
import { IconCloseLine } from '@/generated/icons';
import { cn } from '@/lib/utils';

// Controls (docs/ui.md §4). Focus ring and cursor come from the base layer;
// every control is at least 26 design px tall.

type Tone = 'default' | 'destructive';

/** `[pay]`: brackets in `outline`, label in `primary` (`negative` if destructive). */
export function BracketButton({
  icon: Icon,
  tone = 'default',
  className,
  children,
  ...props
}: Omit<ButtonProps, 'children' | 'className'> & {
  icon?: ComponentType<IconProps>;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      {...props}
      className={cn(
        'press inline-flex min-h-hit min-w-hit shrink-0 items-center justify-center px-[3px] whitespace-nowrap compact:text-[0.7188rem]',
        tone === 'destructive' ? 'text-negative' : 'text-primary',
        'disabled:cursor-not-allowed disabled:text-text-muted',
        className,
      )}
    >
      <span aria-hidden="true" className="text-outline">
        [
      </span>
      {Icon === undefined ? null : (
        <Icon className="mr-[3px] size-3.5 shrink-0" />
      )}
      <span>{children}</span>
      <span aria-hidden="true" className="text-outline">
        ]
      </span>
    </Button>
  );
}

/** The one filled action of a strip (for example **+ new**). */
export function PrimaryButton({
  icon: Icon,
  className,
  children,
  ...props
}: Omit<ButtonProps, 'children' | 'className'> & {
  icon?: ComponentType<IconProps>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      {...props}
      className={cn(
        'inline-flex min-h-hit min-w-hit items-center justify-center gap-1 bg-primary px-3 text-small font-semibold text-on-primary',
        'hover:brightness-110 pressed:brightness-90 disabled:cursor-not-allowed disabled:bg-card disabled:text-text-muted',
        className,
      )}
    >
      {Icon === undefined ? null : <Icon className="size-3.5" />}
      {children}
    </Button>
  );
}

/**
 * A full-height button in a strip (title strip, command line): a 1 px seam
 * on its left, muted until hovered. `hbtn` in the locked design.
 */
export const stripButtonClass =
  'press flex h-full min-w-10 shrink-0 items-center justify-center gap-1.5 border-l px-3 whitespace-nowrap text-text-muted hover:text-text';

/** A bordered control face: `label · value ▾`. The menu itself is in menu.tsx. */
export const menuButtonClass =
  'press inline-flex min-h-hit min-w-hit max-w-full items-center gap-1.5 border border-outline px-2 text-small';

export type ToggleOption<Id extends string> = Readonly<{
  id: Id;
  label: string;
  icon?: ComponentType<IconProps>;
}>;

/** Bordered segments; the pressed segment is filled `primary`. */
export function ToggleGroup<Id extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly ToggleOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  className?: string;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const [next] = [...keys];
        if (next !== undefined) onChange(next as Id);
      }}
      className={cn('inline-flex border border-outline', className)}
    >
      {options.map(({ id, label: text, icon: Icon }) => (
        <ToggleButton
          key={id}
          id={id}
          className={cn(
            'press inline-flex min-h-hit min-w-hit items-center gap-1 px-2 text-small',
            'selected:bg-primary selected:text-on-primary selected:hover:bg-primary',
            'not-first:border-l not-first:border-outline',
          )}
        >
          {Icon === undefined ? null : <Icon className="size-3.5" />}
          {text}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

type TagTone = 'muted' | 'warning' | 'negative' | 'positive';

// The border takes the label's colour, except muted (an `outline` border)
// and warning, whose colour is not fitted for text: it keeps a `text` label.
const tagTone: Record<TagTone, string> = {
  muted: 'border-outline text-text-muted',
  warning: 'border-warning text-text',
  negative: 'border-current text-negative',
  positive: 'border-current text-positive',
};

/** A bordered tag in the number font: `3d`, `9d late`, `✓ paid`, `review`. */
export function Tag({
  tone = 'muted',
  className,
  children,
}: {
  tone?: TagTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-[5px] text-tiny leading-4 whitespace-nowrap compact:px-[3px]',
        tagTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A filter chip with a remove (×) button, for the chip bar above a list. */
export function Chip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  /** Accessible name of the remove button, for example "Remove Food". */
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center border border-outline text-small">
      <span className="truncate px-2">{label}</span>
      <Button
        aria-label={removeLabel}
        onPress={onRemove}
        className="press flex size-hit items-center justify-center border-l border-outline text-text-muted"
      >
        <IconCloseLine className="size-3.5" />
      </Button>
    </span>
  );
}

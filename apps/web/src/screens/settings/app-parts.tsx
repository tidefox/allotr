import type { PaletteTheme, Role } from '@allotr/shared';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { CheckboxButton, CheckboxField } from 'react-aria-components';
import { IconCheckboxBlankLine, IconCheckboxLine } from '@/generated/icons';
import { Brackets, bracketClass } from '@/components/buttons';
import { cn } from '@/lib/utils';

// Small pieces the App tab and the theme editor share.

/** A `[link]` that looks like a BracketButton but navigates. */
export function BracketLink({
  children,
  className,
  ...props
}: LinkProps & { className?: string; children: ReactNode }) {
  return (
    <Link {...props} className={cn(bracketClass, className)}>
      <Brackets>{children}</Brackets>
    </Link>
  );
}

/** A label on the left, its control on the right; the text truncates first. */
export function PreferenceRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-row items-center justify-between gap-x-3 border-b px-3 py-1">
      <div className="min-w-0">
        <p className="truncate text-small">{label}</p>
        {hint === undefined ? null : (
          <p className="truncate font-ui text-tiny text-text-muted">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** One colour as a flat square. The colour is a theme's own, set inline. */
export function Swatch({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('block size-4 shrink-0 border border-outline', className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** A label and its control, as one `kv` line (`dt` and `dd`). */
export function KvRow({
  label,
  tag,
  children,
}: {
  label: string;
  tag?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <dt className="text-text-muted">
        {label}
        {tag}
      </dt>
      <dd className="m-0 flex min-w-0 items-center justify-end font-ui">
        {children}
      </dd>
    </>
  );
}

/** The `kv` list: labels left, values right. */
export function KvList({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5">
      {children}
    </dl>
  );
}

/** A checkbox in the mockup's `check` style: ☑ and a short word. */
export function CheckControl({
  label,
  text,
  checked,
  onChange,
}: {
  /** The accessible name. */
  label: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const Icon = checked ? IconCheckboxLine : IconCheckboxBlankLine;
  return (
    <CheckboxField
      aria-label={label}
      isSelected={checked}
      onChange={onChange}
      className="inline-flex"
    >
      <CheckboxButton className="press inline-flex min-h-hit items-center gap-1.5 whitespace-nowrap text-text-muted">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        {text}
      </CheckboxButton>
    </CheckboxField>
  );
}

/** A strip of a theme's key roles. */
export function Swatches({
  theme,
  roles,
}: {
  theme: PaletteTheme;
  roles: readonly Role[];
}) {
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {roles.map((role) => (
        <Swatch
          key={role}
          color={theme.resolved.roles[role]}
          className="size-3.5 border-0"
        />
      ))}
    </span>
  );
}

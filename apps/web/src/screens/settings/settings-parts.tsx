import type { PaletteTheme, Role } from '@allotr/shared';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Small pieces the App tab and the theme editor share.

/** A `[link]` that looks like a BracketButton but navigates. */
export function BracketLink({
  children,
  className,
  ...props
}: LinkProps & { className?: string; children: ReactNode }) {
  return (
    <Link
      {...props}
      className={cn(
        'press inline-flex min-h-hit min-w-hit items-center gap-1 px-1 text-small text-primary',
        className,
      )}
    >
      <span aria-hidden="true" className="text-outline">
        [
      </span>
      <span>{children}</span>
      <span aria-hidden="true" className="text-outline">
        ]
      </span>
    </Link>
  );
}

/** A label on the left, its control on the right; wraps on a narrow tile. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-row flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-3 py-1">
      <div className="min-w-0">
        <p className="text-small">{label}</p>
        {hint === undefined ? null : (
          <p className="font-ui text-tiny text-text-muted">{hint}</p>
        )}
      </div>
      {children}
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
          className="-ml-px first:ml-0"
        />
      ))}
    </span>
  );
}

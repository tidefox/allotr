import { z } from 'zod';
import { hexColorSchema, normalizeHex } from './color.ts';
import { CANONICAL_HUES } from './palette.ts';
import type { PaletteTheme } from './palette-themes.ts';
import { resolveTheme } from './resolve.ts';
import type { Role, RoleEntry } from './roles.ts';

// The accent a person picks for the interface: `auto` (the theme's own),
// one of the canonical hues (the theme's red, blue, ...) or a hex colour.
// A theme that sets its own `primary` keeps it; the pick applies to the
// rest, by moving the roles that carry the accent through the same
// resolver, so contrast is fitted as for any theme.

export const accentSchema = z.union([
  z.literal('auto'),
  z.enum(CANONICAL_HUES),
  hexColorSchema,
]);
export type Accent = z.infer<typeof accentSchema>;

export const DEFAULT_ACCENT: Accent = 'auto';

const CUSTOM = 'accent-custom';

export function themeSetsAccent(theme: PaletteTheme): boolean {
  return theme.roles.primary !== undefined;
}

/**
 * The role colours of a theme under an accent. The theme's own colours
 * when the accent is `auto` or the theme sets its own `primary`.
 */
export function accentRoles(
  theme: PaletteTheme,
  accent: Accent,
): Readonly<Record<Role, string>> {
  if (accent === 'auto' || themeSetsAccent(theme)) return theme.resolved.roles;
  const custom = accent.startsWith('#');
  const slot = custom ? CUSTOM : accent;
  const light = theme.scheme === 'light';
  const container: RoleEntry = {
    slot,
    alpha: light ? 0.18 : 0.24,
    over: 'card',
  };
  const palette = custom
    ? {
        ...theme.palette,
        accents: { ...theme.palette.accents, [CUSTOM]: normalizeHex(accent) },
      }
    : theme.palette;
  return resolveTheme({
    scheme: theme.scheme,
    palette,
    roles: {
      ...theme.roles,
      primary: { slot },
      'primary-container': container,
      'hero-ok': { slot },
      ring: { slot },
    },
  }).roles;
}

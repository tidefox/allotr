import {
  PALETTE_THEMES,
  slotPaletteTheme,
  THEME_SCHEMES,
  toThemeFileV2,
  type Appearance,
  type CustomThemeView,
  type PaletteTheme,
  type Role,
  type ThemeScheme,
} from '@allotr/shared';

// The App tab's pure parts (docs/ui.md §6): what each theme slot can pick,
// which picks need a credit line, and a theme as a downloadable file.

/** The roles a swatch strip shows, in order. */
export const SWATCH_ROLES = [
  'canvas',
  'card',
  'text',
  'hero-ok',
  'positive',
  'negative',
  'primary',
] as const satisfies readonly Role[];

export type SlotOption = Readonly<{
  id: string;
  name: string;
  custom: boolean;
}>;

/** Shipped themes of a scheme, then the user's own, for a slot's menu. */
export function slotOptions(
  scheme: ThemeScheme,
  custom: readonly PaletteTheme[],
): SlotOption[] {
  const customIds = new Set(custom.map((theme) => theme.id));
  return [...PALETTE_THEMES, ...custom]
    .filter((theme) => theme.scheme === scheme)
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      custom: customIds.has(theme.id),
    }));
}

/** The themes in use that carry a credit, once each. */
export function creditedThemes(
  appearance: Appearance,
  custom: readonly PaletteTheme[],
): PaletteTheme[] {
  return THEME_SCHEMES.map((scheme) =>
    slotPaletteTheme(appearance[scheme], scheme, custom),
  ).filter(
    (theme, at, all) =>
      theme.credit !== undefined &&
      all.findIndex((other) => other.id === theme.id) === at,
  );
}

/** `my-theme.json` from a theme's name. */
export function themeFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug === '' ? 'theme' : slug}.json`;
}

/** The theme file (ADR 0016, v2) as the text a download saves. */
export function themeFileText(theme: CustomThemeView): string {
  return `${JSON.stringify(toThemeFileV2(theme), null, 2)}\n`;
}

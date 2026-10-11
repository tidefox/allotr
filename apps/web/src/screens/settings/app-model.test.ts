import {
  DEFAULT_APPEARANCE,
  DEFAULT_PALETTE_THEME_ID,
  PALETTE_THEMES,
  paletteTheme,
  themeFileV2Schema,
  type CustomThemeView,
  type PaletteTheme,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  creditedThemes,
  slotOptions,
  themeFileName,
  themeFileText,
} from './app-model.ts';

const shippedDark = PALETTE_THEMES.find(
  (theme) => theme.id === DEFAULT_PALETTE_THEME_ID.dark,
);
if (shippedDark === undefined) throw new Error('no default dark theme');
const dark: PaletteTheme = shippedDark;

function ownTheme(id: string, name: string): PaletteTheme {
  return paletteTheme(id, {
    format: 'allotr-theme',
    version: 2,
    name,
    scheme: dark.scheme,
    palette: dark.palette,
  });
}

describe('slotOptions', () => {
  it('lists the scheme only, shipped first and the own ones marked', () => {
    const mine = ownTheme('c1', 'Tidepool');
    const options = slotOptions('dark', [mine]);
    expect(options.at(-1)).toEqual({
      id: 'c1',
      name: 'Tidepool',
      custom: true,
    });
    expect(options.slice(0, -1).every((option) => !option.custom)).toBe(true);
    expect(options.length).toBeGreaterThan(1);
    expect(slotOptions('light', [mine]).some((o) => o.custom)).toBe(false);
  });
});

describe('creditedThemes', () => {
  it('lists the credited themes in use', () => {
    const ids = creditedThemes(DEFAULT_APPEARANCE, []).map((theme) => theme.id);
    expect(ids).toEqual([
      DEFAULT_PALETTE_THEME_ID.light,
      DEFAULT_PALETTE_THEME_ID.dark,
    ]);
  });

  it('leaves out an own theme, which has no credit', () => {
    const mine = ownTheme('c1', 'Tidepool');
    const appearance = { ...DEFAULT_APPEARANCE, dark: 'c1' };
    expect(creditedThemes(appearance, [mine]).map((theme) => theme.id)).toEqual(
      [DEFAULT_PALETTE_THEME_ID.light],
    );
  });
});

describe('themeFileName', () => {
  it('slugs a name', () => {
    expect(themeFileName('My Tidepool Night!')).toBe('my-tidepool-night.json');
    expect(themeFileName('  ')).toBe('theme.json');
  });
});

describe('themeFileText', () => {
  it('writes a v2 theme file that reads back, ending in a newline', () => {
    const view = {
      ...ownTheme('c1', 'Tidepool'),
      roles: {},
    } as unknown as CustomThemeView;
    const text = themeFileText(view);
    expect(text.endsWith('\n')).toBe(true);
    const file = themeFileV2Schema.parse(JSON.parse(text));
    expect(file.name).toBe('Tidepool');
    expect(file.version).toBe(2);
  });
});

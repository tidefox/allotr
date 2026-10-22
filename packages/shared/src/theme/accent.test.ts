import { describe, expect, it } from 'vitest';
import { accentRoles, accentSchema, themeSetsAccent } from './accent.ts';
import { contrastRatio } from './color.ts';
import {
  findPaletteTheme,
  paletteTheme,
  toThemeFileV2,
} from './palette-themes.ts';
import { fixtureDawn } from './testing.ts';

function theme(id: string) {
  const found = findPaletteTheme(id, []);
  if (found === undefined) throw new Error(id);
  return found;
}

describe('accentSchema', () => {
  it('reads auto, a hue or a hex', () => {
    for (const ok of ['auto', 'blue', 'pink', '#3569b5'])
      expect(accentSchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of ['purpel', '3569b5', '#12', ''])
      expect(accentSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe('accentRoles', () => {
  it('leaves the theme alone on auto', () => {
    const nord = theme('nord');
    expect(accentRoles(nord, 'auto')).toBe(nord.resolved.roles);
  });

  it('moves the accent roles to the chosen hue', () => {
    const nord = theme('nord');
    const roles = accentRoles(nord, 'blue');
    expect(roles.primary).not.toBe(nord.resolved.roles.primary);
    expect(roles['hero-ok']).not.toBe(nord.resolved.roles['hero-ok']);
    expect(roles.canvas).toBe(nord.resolved.roles.canvas);
    expect(roles.danger).toBe(nord.resolved.roles.danger);
  });

  it('takes a custom hex and keeps it readable on every theme', () => {
    for (const id of [
      'catppuccin-latte',
      'catppuccin-mocha',
      'neutral-black',
    ]) {
      const t = theme(id);
      const roles = accentRoles(t, '#ff00aa');
      for (const surface of ['canvas', 'card', 'chrome'] as const)
        expect(
          contrastRatio(roles.primary, roles[surface]),
          `${id} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps a shipped theme that sets its own primary', () => {
    const mocha = theme('catppuccin-mocha');
    expect(themeSetsAccent(mocha)).toBe(true);
    expect(accentRoles(mocha, 'red')).toBe(mocha.resolved.roles);
  });

  it('keeps a theme that sets its own primary', () => {
    const own = paletteTheme(
      'own',
      toThemeFileV2({
        name: 'Own',
        scheme: 'light',
        palette: fixtureDawn,
        roles: { primary: { slot: 'red' } },
      }),
    );
    expect(themeSetsAccent(own)).toBe(true);
    expect(accentRoles(own, 'blue')).toBe(own.resolved.roles);
  });
});

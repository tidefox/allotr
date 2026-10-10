import {
  DEFAULT_PALETTE_THEME_ID,
  NEUTRAL_SLOTS,
  PALETTE_THEMES,
  ROLES,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  checkDraft,
  draftFrom,
  withAccentName,
  withRole,
} from '@/features/themes/draft.ts';
import {
  blockedReason,
  colorChoices,
  contrastVerdict,
  isContentRole,
  roleRatios,
  roleSlotChoices,
  slotChoices,
} from './theme-editor-model.ts';

const shipped = PALETTE_THEMES.find(
  (theme) => theme.id === DEFAULT_PALETTE_THEME_ID.light,
);
if (shipped === undefined) throw new Error('no default light theme');
const draft = draftFrom(shipped, 'Tidepool');

describe('colorChoices', () => {
  it('offers every neutral and accent', () => {
    const choices = colorChoices(draft);
    expect(choices).toHaveLength(NEUTRAL_SLOTS.length + draft.accents.length);
    expect(choices[0]).toMatchObject({ name: NEUTRAL_SLOTS[0] });
  });

  it('leaves out a colour that is half typed', () => {
    const broken = {
      ...draft,
      neutrals: { ...draft.neutrals, text: '#12' },
    };
    expect(colorChoices(broken).some((c) => c.name === 'text')).toBe(false);
  });
});

describe('slotChoices', () => {
  it('lists neutrals, hues, then accents that are not hues once', () => {
    const slots = slotChoices(draft);
    expect(slots.slice(0, NEUTRAL_SLOTS.length)).toEqual([...NEUTRAL_SLOTS]);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toContain('blue');
  });

  it('follows an accent rename', () => {
    const [first] = draft.accents;
    if (first === undefined) throw new Error('no accent');
    const renamed = withAccentName(draft, first.key, 'lagoon-teal');
    expect(slotChoices(renamed)).toContain('lagoon-teal');
  });
});

describe('roleSlotChoices', () => {
  it('keeps a slot that is no longer in the palette', () => {
    expect(roleSlotChoices(['a', 'b'], 'gone')).toEqual(['gone', 'a', 'b']);
    expect(roleSlotChoices(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });
});

describe('contrastVerdict and blockedReason', () => {
  it('passes a shipped theme with a name', () => {
    const check = checkDraft(draft);
    expect(['pass', 'adjusted']).toContain(contrastVerdict(check).kind);
    expect(blockedReason(check)).toBeNull();
  });

  it('is invalid with a bad palette colour', () => {
    const check = checkDraft({
      ...draft,
      neutrals: { ...draft.neutrals, base: 'nope' },
    });
    expect(contrastVerdict(check)).toEqual({ kind: 'invalid' });
    expect(blockedReason(check)).toBe('palette');
  });

  it('asks for a name before anything else', () => {
    expect(blockedReason(checkDraft({ ...draft, name: '' }))).toBe('name');
  });

  it('fails when a fixed role cannot reach its contrast', () => {
    const check = checkDraft(
      withRole(draft, 'text', { slot: 'base', fit: 'off' }),
    );
    expect(contrastVerdict(check).kind).toBe('failing');
    expect(blockedReason(check)).toBe('contrast');
  });
});

describe('roleRatios', () => {
  it('gives ratios for content roles and none for surfaces', () => {
    const { resolved } = checkDraft(draft);
    if (resolved === null) throw new Error('should resolve');
    expect(roleRatios('canvas', resolved)).toEqual([]);
    const text = roleRatios('text', resolved);
    expect(text.length).toBeGreaterThan(0);
    expect(text.every((entry) => entry.ratio >= 1)).toBe(true);
    expect(isContentRole('text')).toBe(true);
    expect(isContentRole('canvas')).toBe(false);
  });

  it('covers every role without throwing', () => {
    const { resolved } = checkDraft(draft);
    if (resolved === null) throw new Error('should resolve');
    for (const role of ROLES)
      expect(() => roleRatios(role, resolved)).not.toThrow();
  });
});

import {
  CANONICAL_HUES,
  contrastRatio,
  CONTRAST_MINIMUM,
  hexColorSchema,
  NEUTRAL_SLOTS,
  ROLE_SPECS,
  type ResolvedTheme,
  type Role,
} from '@allotr/shared';
import type { DraftCheck, ThemeDraft } from '@/features/themes/draft.ts';

// The theme editor's pure parts (ADR 0016): which colours and slots a menu
// offers, the contrast verdict, and why saving is refused. The contrast
// ratios are the shared resolver's maths, not money.

export type ColorChoice = Readonly<{
  id: string;
  name: string;
  color: string;
}>;

/** The palette's valid colours, neutrals then accents, for "from palette". */
export function colorChoices(draft: ThemeDraft): ColorChoice[] {
  const valid = (color: string) => hexColorSchema.safeParse(color).success;
  return [
    ...NEUTRAL_SLOTS.map((slot) => ({
      id: `neutral-${slot}`,
      name: slot,
      color: draft.neutrals[slot],
    })),
    ...draft.accents.map((accent) => ({
      id: accent.key,
      name: accent.name,
      color: accent.color,
    })),
  ].filter((choice) => valid(choice.color));
}

/** Every name a role may take its colour from: neutrals, hues, own accents. */
export function slotChoices(draft: ThemeDraft): string[] {
  const hues: readonly string[] = CANONICAL_HUES;
  return [
    ...NEUTRAL_SLOTS,
    ...CANONICAL_HUES,
    ...draft.accents
      .map((accent) => accent.name)
      .filter((name) => !hues.includes(name)),
  ];
}

/** The slots a role's menu offers, keeping a slot that has gone from the palette. */
export function roleSlotChoices(
  slots: readonly string[],
  current: string,
): string[] {
  return slots.includes(current) ? [...slots] : [current, ...slots];
}

export type ContrastVerdict =
  | { kind: 'invalid' }
  | { kind: 'failing'; count: number }
  | { kind: 'pass' }
  | { kind: 'adjusted'; count: number };

export function contrastVerdict(check: DraftCheck): ContrastVerdict {
  if (check.resolved === null) return { kind: 'invalid' };
  if (check.problems.length > 0)
    return { kind: 'failing', count: check.problems.length };
  const count = Object.keys(check.resolved.fitted).length;
  return count === 0 ? { kind: 'pass' } : { kind: 'adjusted', count };
}

/** Why a save is refused, or null when it may go ahead. */
export function blockedReason(
  check: DraftCheck,
): 'name' | 'palette' | 'contrast' | null {
  if (check.body !== null) return null;
  if (check.nameError) return 'name';
  return check.resolved === null ? 'palette' : 'contrast';
}

/** The contrast a role must reach on each surface; none for surfaces and decoration. */
export function roleRatios(
  role: Role,
  resolved: ResolvedTheme,
): { surface: Role; ratio: number; pass: boolean }[] {
  const spec = ROLE_SPECS[role];
  if (spec.kind === 'surface' || spec.kind === 'decorative') return [];
  const need = CONTRAST_MINIMUM[spec.kind];
  return spec.on.map((surface) => {
    const ratio = contrastRatio(resolved.roles[role], resolved.roles[surface]);
    return { surface, ratio, pass: ratio >= need };
  });
}

/** Whether a role is content the fitter adjusts (so it gets the fit toggle). */
export function isContentRole(role: Role): boolean {
  const kind = ROLE_SPECS[role].kind;
  return kind !== 'surface' && kind !== 'decorative';
}

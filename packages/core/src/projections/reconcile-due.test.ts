import { addDays, localDate } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { reconcileDue } from './reconcile-due.ts';

const today = localDate('2026-03-31');
const open = { archived: false };

const due = (back: number) =>
  reconcileDue({ ...open, lastReconciledOn: addDays(today, -back) }, today);

describe('reconcileDue', () => {
  it('is due when never reconciled', () => {
    expect(reconcileDue({ ...open, lastReconciledOn: null }, today)).toBe(true);
  });

  it('is not due on day 30 and due on day 31', () => {
    expect(due(0)).toBe(false);
    expect(due(30)).toBe(false);
    expect(due(31)).toBe(true);
  });

  it('is never due for an archived account', () => {
    expect(
      reconcileDue({ archived: true, lastReconciledOn: null }, today),
    ).toBe(false);
  });

  it('is monotone: a more recent reconcile is never due when an older one is not', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        (a, b) => {
          const older = Math.max(a, b);
          const newer = Math.min(a, b);
          expect(due(newer) && !due(older)).toBe(false);
        },
      ),
    );
  });
});

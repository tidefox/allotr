import {
  monthsBetween,
  money,
  type LocalDate,
  type Money,
} from '@allotr/shared';

// What a savings goal asks for each month (docs/domain.md "Goals"), a pure
// function of the amount still missing, the goal's date and today.

/**
 * The monthly amount that reaches the goal by its date: `remaining` divided
 * by the calendar months from this month to the target's month (October to
 * March is 5), rounded up to the next minor unit so the goal is never
 * short. The target's own month counts, so a date in the current month
 * asks for everything in one go (1 month).
 *
 * Null when there is nothing to ask for: no date, nothing missing (the goal
 * is reached) or a date before `today`.
 */
export function goalMonthlyNeeded(
  goal: Readonly<{
    /** What is still missing, in the goal's currency; zero once reached. */
    remaining: Money;
    targetOn: LocalDate | null;
  }>,
  today: LocalDate,
): Money | null {
  if (goal.targetOn === null || goal.targetOn < today) return null;
  const missing = BigInt(goal.remaining.amountMinor);
  if (missing <= 0n) return null;
  const months = BigInt(Math.max(1, monthsBetween(today, goal.targetOn)));
  return money(
    Number((missing + months - 1n) / months),
    goal.remaining.currency,
  );
}

/** A full bar, in basis points. */
const FULL_BP = 10_000n;

/**
 * How far along a goal is, in basis points: `saved` over `target`, rounded
 * down so a goal never reads as reached before it is, and clamped to
 * 0..10 000 (nothing saved or a debt is 0, a surplus is still 10 000).
 * Both amounts are in the goal's currency. A target that is not positive
 * has no progress to speak of, so 0.
 */
export function goalProgressBp(saved: Money, target: Money): number {
  const goal = BigInt(target.amountMinor);
  const held = BigInt(saved.amountMinor);
  if (goal <= 0n || held <= 0n) return 0;
  const bp = (held * FULL_BP) / goal;
  return Number(bp > FULL_BP ? FULL_BP : bp);
}

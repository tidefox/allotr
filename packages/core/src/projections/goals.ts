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

import { t } from '@/messages/t';

// A share the server sent in basis points (10 000 is the whole), as text.
// The server did the arithmetic; this only picks the words: whole percents,
// and "<1%" for a share that exists but is too small to round to 1.

export function shareText(basisPoints: number): string {
  if (basisPoints <= 0) return '0%';
  const whole = Math.round(basisPoints / 100);
  return whole < 1
    ? t('reportsSummary.categories.lessThanOne')
    : `${String(whole)}%`;
}

/**
 * A goal's progress the server sent in basis points, as whole percents
 * rounded down, so an unreached goal never reads as 100%.
 */
export function progressText(basisPoints: number): string {
  return `${String(Math.floor(Math.max(0, basisPoints) / 100))}%`;
}

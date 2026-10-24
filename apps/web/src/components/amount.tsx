import type { Money } from '@allotr/shared';
import { formatMoney, type CurrencyDisplay } from '@/lib/format-money';
import { toneClass, valueTone } from '@/lib/value-tone';
import { cn } from '@/lib/utils';

// An amount in the number font (docs/ui.md §4). The sign and an arrow always
// come with the colour, so meaning never rests on colour alone (principle 9).
// It formats what the server produced; it never adds or converts.

export type AmountKind = 'expense' | 'income' | 'transfer' | 'change' | 'plain';

const ARROW: Record<AmountKind, string> = {
  expense: '↓',
  income: '↑',
  transfer: '↔',
  // A change takes its arrow from the sign; zero has none.
  change: '',
  plain: '',
};

export function Amount({
  amount,
  kind = 'plain',
  mode = 'symbol',
  locale,
  className,
}: {
  /** Signed as stored: expenses negative, income positive. */
  amount: Money;
  kind?: AmountKind;
  mode?: CurrencyDisplay;
  locale?: string;
  className?: string;
}) {
  const negative = amount.amountMinor < 0;
  const shown = kind === 'plain' ? amount : { ...amount };
  const arrow =
    kind === 'change'
      ? amount.amountMinor > 0
        ? '↑'
        : negative
          ? '↓'
          : ''
      : ARROW[kind];
  const text =
    (kind === 'income' || kind === 'change') &&
    !negative &&
    !(kind === 'change' && amount.amountMinor === 0)
      ? `+${formatMoney(shown, mode, locale)}`
      : formatMoney(shown, mode, locale).replace('-', '−');
  const tone =
    kind === 'plain'
      ? 'neutral'
      : valueTone(
          amount.amountMinor,
          kind === 'transfer' ? 'transfer' : undefined,
        );
  return (
    <span
      className={cn(
        'whitespace-nowrap font-num tabular-nums',
        // Money in a row is medium weight; a plain figure keeps its caller's.
        kind === 'plain' ? '' : cn('font-medium', toneClass[tone]),
        className,
      )}
    >
      {arrow === '' ? null : (
        <span aria-hidden="true" className="mr-[2px] text-[0.85em]">
          {arrow}
        </span>
      )}
      {text}
    </span>
  );
}

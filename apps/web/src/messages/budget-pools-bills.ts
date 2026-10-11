// The Budget screen's pools and bills sub-tabs (docs/ui.md §6). Spread into
// `en` so the other Budget sub-tabs can add their own files.
export const budgetPools = {
  failed: 'Pools could not be loaded.',
  retry: 'Try again',
  empty: 'No pools yet',
  emptyHint: 'Pools group accounts. Add one in Settings.',
  dailyLabel: '{name} counts toward daily',
  dailyFixedLabel: '{name} always counts toward daily',
  saveFailed: 'Could not change {name}. Try again.',
  counts: 'counts toward daily',
  onBudget: 'on-budget',
  offBudget: 'off-budget',
  addAccount: 'account',
  addAccountTo: 'Add an account to {name}',
  left: '{left} left of {start} this cycle',
  leftLabel: 'Left of {name} this cycle',
  noAccounts: 'no accounts in this pool',
  sparkline: '{name} balance, last 30 days',
  how: {
    title: 'how the daily number works',
    body: 'Pools that count toward daily add up to the on-budget total. Bills set aside come off first, the rest is split over the days to payday. Savings are never included.',
  },
} as const;

export const budgetBills = {
  failed: 'Bills could not be loaded.',
  retry: 'Try again',
  timeline: {
    title: 'bills this cycle',
    subtitle: '{from} – {to}',
    label: 'Bills and payday across the cycle',
    payday: 'payday',
    unknown: 'Bill',
  },
  figures: {
    setAside: 'set aside',
    paid: 'paid',
    next: 'next',
    none: 'none due',
    nextValue: '{name} · {when}',
  },
  tag: {
    in: '{days}d',
    today: 'today',
    late: '{days}d late',
    paid: '✓ paid',
  },
  upcoming: {
    title: 'upcoming',
    subtitle: {
      one: '{count} bill',
      other: '{count} bills',
    },
    empty: 'nothing left to pay',
    emptyHint: 'Every bill due this cycle is paid.',
    stillSetAside: '{amount} still set aside',
  },
  paid: {
    title: 'paid this cycle',
    empty: 'nothing paid yet',
    emptyHint: 'Bills you pay this cycle show up here.',
    actionsOf: 'Actions for {name}',
    show: 'Show payment',
  },
  later: {
    title: 'not due this cycle',
    subtitle: 'due again later',
    day: 'day {day}',
  },
} as const;

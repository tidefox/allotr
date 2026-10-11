// The Reports screen's plan and cycles tabs (docs/ui.md §6). Spread into
// `en` as `reportsPlan`.
export const reportsPlan = {
  loadFailed: 'This could not be loaded.',
  retry: 'Try again',
  budget: {
    title: 'budget vs actual',
    barLabel: '{name} spent',
    emptyTitle: 'No budgets yet',
    emptyHint:
      'Add a budget on the Budget screen to compare it with what you spent.',
  },
  rate: {
    title: 'savings rate',
    subtitle: 'per cycle',
    inProgress: '{cycle} in progress',
    summary: 'Savings rate per cycle',
    emptyTitle: 'No cycles yet',
    emptyHint: 'Rates appear once a paycheck has opened a cycle.',
    none: '–',
  },
  netWorth: {
    title: 'net worth',
    summary: 'Net worth over {days} days: {end} now, a change of {change}',
    caption: 'Net worth by day',
    day: 'Day',
    total: 'Net worth',
    change: 'over {days} days',
    emptyTitle: 'No history yet',
    emptyHint: 'Net worth appears once an account has a balance.',
  },
  cycles: {
    thisCycle: 'this cycle',
    closed: '{count} closed',
    spent: {
      title: 'spent per cycle',
      summary: 'Spent per cycle',
    },
    saved: {
      title: 'saved per cycle',
      summary: 'Saved per cycle',
    },
    table: {
      title: 'past cycles',
      cycle: 'cycle',
      spent: 'spent',
      saved: 'saved',
      rate: 'rate',
      amended: 'amended',
    },
    emptyTitle: 'No cycles yet',
    emptyHint: 'A cycle opens with your first paycheck.',
  },
} as const;

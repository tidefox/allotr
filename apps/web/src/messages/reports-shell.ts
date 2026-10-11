// The Reports screen's shared pieces: the period toolbar
// (docs/ui.md §6). Spread into `en` as `reportsShell`.
export const reportsShell = {
  period: {
    label: 'period',
    cycle: 'this cycle',
    'last-cycle': 'last cycle',
    month: 'this month',
    'last-month': 'last month',
  },
  span: '{from} – {to}',
  day: 'day {day}/{length}',
  noCycle: 'There is no cycle before this one yet.',
} as const;

// The create-bill sheet (docs/ui.md §3, §6). The field names and amount
// errors are shared with `settings.bills`.
export const billForm = {
  title: 'New bill',
  add: 'bill',
  addLabel: 'Add a bill',
  category: 'Category (optional)',
  noCategory: 'None',
  dueDayValue: 'day {day}',
  intro:
    'A bill is set aside from your daily number until you mark it paid. A due day past the end of a month uses its last day.',
  save: 'Add bill',
  saving: 'Adding…',
  loading: 'Loading your accounts…',
  errors: {
    name: 'Enter a name.',
    account: 'Choose the account that pays it.',
  },
} as const;

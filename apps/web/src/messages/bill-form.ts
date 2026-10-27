// The create-bill sheet (docs/ui.md §3, §6). The field names and amount
// errors are shared with `settings.bills`.
export const billForm = {
  title: 'New bill',
  editTitle: 'Edit bill',
  saveEdit: 'Save changes',
  edit: 'Edit bill',
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
  priceCurrency: 'Priced in (optional)',
  noPrice: 'Same as the account',
  priceIn: 'Price in {currency}',
  status: 'Status',
  active: 'Active',
  paused: 'Paused (not set aside)',
  delete: 'Delete bill',
  deleteTitle: 'Delete {name}?',
  deleteBody:
    'The bill and its payment marks are removed. Entries already recorded stay in the ledger.',
  deleteAction: 'Delete',
  deleting: 'Deleting…',
  markPaid: 'Mark paid',
  undoPaid: 'Undo payment',
  pausedTitle: 'Paused',
  pausedSubtitle: 'Not set aside until you make them active again',
  errors: {
    priceSame: 'Pick a currency other than the account’s.',
    name: 'Enter a name.',
    account: 'Choose the account that pays it.',
  },
} as const;

export const billDetail = {
  amount: 'Amount',
  price: 'Price',
  reserve: 'Set aside',
  payments: 'Payments',
  none: 'No payments yet.',
  marked: 'marked paid',
  pick: 'Pick a bill',
  pickHint: 'Its terms and payments show here.',
} as const;

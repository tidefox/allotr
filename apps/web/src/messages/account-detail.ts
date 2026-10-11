// The Accounts detail pane and its sheets (docs/ui.md §6). Kept in its own
// file and spread into `en` so the list side can grow its own block. The
// reconcile and archive wording itself stays under `accounts.*`.
export const accountDetail = {
  title: 'account',
  close: 'Close account',
  failed: 'This account could not be loaded.',
  retry: 'Try again',
  tags: { archived: 'archived' },
  fields: {
    pool: 'pool',
    type: 'type',
    reconciled: 'reconciled',
    limit: 'credit limit',
    minPayment: 'min payment',
    due: 'next due',
  },
  credit: { bar: 'Credit left of the limit', free: '{free} free of {limit}' },
  poolCounts: '{pool} · counts toward daily',
  poolOff: '{pool} · off-budget',
  creditPool: 'credit',
  typeLine: '{kind} · {currency}',
  reconciledUpToDate: '{date} · up to date',
  reconciledDue: '{date} · needs a look',
  groups: { on: 'On budget', off: 'Off budget' },
  kinds: {
    asset: 'asset',
    liability: 'debt you owe',
    receivable: 'owed to you',
    payable: 'owed by you',
  },
  history: {
    title: 'Balance',
    summary: 'Balance of {name}, last {days} days: from {start} to {end}.',
    caption: 'Balance by day',
    day: 'Day',
    balance: 'Balance',
    failed: 'The balance history could not be loaded.',
    empty: 'No history yet.',
  },
  recent: {
    title: 'recent',
    all: 'all entries',
    empty: 'no entries yet',
    failed: 'The entries could not be loaded.',
  },
  actions: {
    reconcile: 'reconcile',
    transfer: 'transfer',
    edit: 'edit',
    more: 'More actions for {name}',
    move: 'Move to another pool',
    archive: 'Archive',
  },
  reconcileSheet: {
    failed: 'Could not compare with the bank. Try again.',
    adjustFailed:
      'Could not adjust. The difference may have changed, so compare again.',
    again: 'Compare again',
  },
  archiveSheet: {
    failed: 'Could not archive this account. Try again.',
    noTargetChosen: 'Choose where to transfer the balance.',
  },
} as const;

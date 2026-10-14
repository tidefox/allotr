// Withdrawal links on the entry detail (ADR 0038): the "Paid from savings"
// section of an expense and the "Paid for" section of a savings withdrawal.
export const withdrawalLinks = {
  expense: {
    title: 'Paid from savings',
    action: 'Paid from savings…',
    empty: 'No savings withdrawal within two weeks can be linked to this.',
    sheetTitle: 'Paid from savings',
    intro:
      'Choose the transfer from savings that paid for this purchase. Only the part you paid yourself counts against your day.',
    candidates: 'Savings withdrawals',
    amount: 'Part paid from savings',
  },
  withdrawal: {
    title: 'Paid for',
    action: 'Paid for…',
    empty: 'No purchase within two weeks can be linked to this.',
    sheetTitle: 'Paid for',
    intro:
      'Choose the purchase this transfer from savings paid for. The linked part is read as if savings had paid it.',
    candidates: 'Purchases',
    amount: 'Part paid for',
  },
  candidate: '{date} · {name}',
  room: 'up to {amount}',
  candidateLabel: '{name}, {date}, {amount}, {room}',
  noName: 'no note',
  save: 'Link',
  saving: 'Linking…',
  cancel: 'Cancel',
  chooseOne: 'Choose an entry to link.',
  notCounting: 'not counting',
  open: 'open',
  remove: 'remove',
  removeLabel: 'Remove the link with {name}',
  removing: 'Removing…',
  confirm:
    'Remove this link? Both entries stay; the budget stops reading the amount as paid from savings.',
  confirmYes: 'remove link',
  confirmKeep: 'keep',
  loadFailed: 'Links could not be loaded.',
  actionFailed: 'That link could not be removed. Try again.',
  loading: 'Loading…',
  dropped: {
    title: 'A link was not carried over',
    dismiss: 'dismiss',
  },
  tag: {
    expense: 'from savings',
    withdrawal: 'for a purchase',
  },
  // Why a link does not count (valid is false): said on the link's row.
  reasons: {
    withdrawal_missing: 'The savings transfer cannot be found.',
    withdrawal_undone:
      'The savings transfer is deleted, so this does not count.',
    withdrawal_not_transfer: 'That entry is no longer a transfer.',
    withdrawal_not_from_savings:
      'The transfer no longer moves money from savings to your budget.',
    expense_missing: 'The purchase cannot be found.',
    expense_undone: 'The purchase is deleted, so this does not count.',
    expense_not_expense: 'That entry is no longer an expense.',
    expense_outside_funded:
      'The purchase is marked as paid with outside money.',
    expense_bill_payment: 'The purchase is a bill payment.',
    expense_not_on_budget:
      'The purchase is no longer paid from a budget account.',
    amount_not_positive: 'The linked amount is not above zero.',
    currency_mismatch: 'The linked amount is in a different currency.',
    withdrawal_exceeded:
      'The transfer is now smaller than its links, so this does not count.',
    expense_exceeded:
      'The purchase is now smaller than its links, so this does not count.',
  },
} as const;

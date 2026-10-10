// Messages for the Settings data tab (WP10). Spread into `en` as
// `settingsData`. Export wording stays under `settings.export` and the
// delete-account wording under `settings.deleteAccount`.
export const settingsData = {
  cancel: 'Cancel',
  held: 'Turn on two-factor authentication under Account first. Until then, your ledger data cannot be exported or imported.',
  heldAction: 'go to account',
  export: {
    title: 'Export',
    download: 'download',
    formats: {
      json: 'JSON backup',
      csv: 'CSV spreadsheet',
      beancount: 'Beancount ledger',
    },
  },
  import: {
    title: 'Import',
    subtitle: 'into an empty ledger',
    row: 'Backup file',
    rowHint:
      'Choose a JSON backup. It fills an empty ledger in one step: all of it, or none.',
    choose: 'choose file',
    sheetTitle: 'Import {name}?',
    sheetBody:
      'This fills your ledger from the file. It is refused if the ledger already has accounts, entries, bills or rates.',
    size: 'File size: {kb} KB',
    notJson: 'That file is not valid JSON.',
    tooLarge: 'The file is larger than 10 MB.',
    submit: 'Import',
    working: 'Importing…',
    doneTitle: 'Import finished',
    doneBody: 'Created from {name}:',
    done: 'Done',
    problems: 'First problems found:',
    counts: {
      accounts: 'Accounts',
      categoriesCreated: 'Categories created',
      categoriesMatched: 'Categories matched',
      rates: 'Rates',
      tags: 'Tags',
      transactions: 'Entries',
      bills: 'Bills',
      billPayments: 'Bill payments',
      reconciliations: 'Reconciliations',
      ious: 'IOUs',
      pools: 'Pools',
      budgets: 'Budgets',
      coverOverrides: 'Cover overrides',
    },
  },
  deleteAccount: {
    action: 'delete account…',
    exportFirst: 'download JSON backup',
  },
} as const;

// The Reports screen's calendar tab (docs/ui.md §6). Spread into `en` as
// `reportsCalendar`.
export const reportsCalendar = {
  title: 'calendar',
  layers: {
    label: 'Layers',
    heat: 'spending heat',
    due: 'bills & dues',
    legend:
      'b bill · i iou · $ payday · o outside money spent · bill payments not in heat',
  },
  month: {
    previous: 'Previous month',
    next: 'Next month',
  },
  grid: 'grid',
  table: 'table',
  headers: { date: 'Date', spent: 'Spent', due: 'Due' },
  marks: { b: 'bill', i: 'iou', $: 'payday', o: 'outside money spent' },
  failed: 'The calendar could not be loaded.',
  retry: 'Try again',
  day: {
    nothing: 'no entries',
    entry: 'Entry',
    bill: 'bill',
    billPaid: 'bill, paid',
    payday: 'payday',
    paydayName: 'paycheck expected',
    iouOwedToMe: 'iou, owed to you',
    iouOwedByMe: 'iou, you owe',
  },
} as const;

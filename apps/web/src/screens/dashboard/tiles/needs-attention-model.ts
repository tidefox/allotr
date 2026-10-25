import type { LocalDate, Money, ReminderView, TodayView } from '@allotr/shared';

// The "needs attention" tile's items, most urgent first: bills due and
// unpaid (the most days late first, then those due today), then payday
// overdue, missing exchange rates, and the unread IOU and review reminders
// the server made. Bill reminders are left out because the due bills
// already say it.

/** Below this frame width the tile starts folded (docs/ui.md §6). */
export const ATTENTION_OPEN_FROM = 600;

export type AttentionFold = 'auto' | 'open' | 'folded';

/** Whether the tile shows only its title bar: the stored choice, else by width. */
export function attentionFolded(fold: AttentionFold, frameWidth: number) {
  if (fold === 'auto') return frameWidth < ATTENTION_OPEN_FROM;
  return fold === 'folded';
}

export type AttentionItem =
  | { id: string; kind: 'payday-overdue' }
  | {
      id: string;
      kind: 'bill-due';
      name: string;
      amount: Money;
      dueOn: LocalDate;
      today: boolean;
    }
  | { id: string; kind: 'missing-rate'; currency: string }
  | {
      id: string;
      kind: 'reminder';
      reminderId: string;
      reminderKind: Exclude<ReminderView['kind'], 'bill_due'>;
      title: string;
      body: string;
      url: string;
    };

export function attentionItems(
  today: Pick<TodayView, 'today' | 'overdue' | 'billsDue' | 'missingRates'>,
  reminders: readonly ReminderView[],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  // Earliest due date first: the most days late, then today. The sort is
  // stable, so bills due on one day keep the server's order.
  const bills = [...today.billsDue].sort((a, b) =>
    a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0,
  );
  for (const bill of bills) {
    items.push({
      id: `bill-${bill.billId}-${bill.dueOn}`,
      kind: 'bill-due',
      name: bill.name,
      amount: bill.amount,
      dueOn: bill.dueOn,
      today: bill.dueOn === today.today,
    });
  }
  if (today.overdue) {
    items.push({ id: 'payday-overdue', kind: 'payday-overdue' });
  }
  for (const currency of today.missingRates) {
    items.push({ id: `rate-${currency}`, kind: 'missing-rate', currency });
  }
  for (const reminder of reminders) {
    if (reminder.readAt !== null || reminder.kind === 'bill_due') continue;
    items.push({
      id: `reminder-${reminder.id}`,
      kind: 'reminder',
      reminderId: reminder.id,
      reminderKind: reminder.kind,
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
    });
  }
  return items;
}

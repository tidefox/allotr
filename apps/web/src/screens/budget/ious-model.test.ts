import { localDate, money, type IouView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  groupPeople,
  nextDue,
  openCount,
  personFigure,
  overdueCount,
  personKey,
  soleOpen,
} from './ious-model.ts';

function iou(patch: Partial<IouView> & { id: string }): IouView {
  return {
    direction: 'owed-to-me',
    person: 'Alex',
    amount: money(5000, 'USD'),
    repaid: money(0, 'USD'),
    writtenOff: money(0, 'USD'),
    outstanding: money(5000, 'USD'),
    settled: false,
    originId: `o-${patch.id}`,
    recordedOn: localDate('2026-09-01'),
    dueOn: null,
    overdue: false,
    daysOverdue: 0,
    writeOffOfferedOn: null,
    writeOffOffered: false,
    personOpen: { count: 1, outstanding: money(5000, 'USD') },
    settlements: [],
    ...patch,
  };
}

describe('groupPeople', () => {
  const list = [
    iou({ id: '1', person: 'alex' }),
    iou({ id: '2', person: 'Alex', recordedOn: localDate('2026-09-20') }),
    iou({ id: '3', person: 'Bea', direction: 'owed-by-me' }),
    iou({ id: '4', person: 'Cy', settled: true }),
    iou({ id: '5', person: 'Dee', overdue: true, daysOverdue: 4 }),
  ];

  it('merges names that differ only in case, newest IOU first', () => {
    const alex = groupPeople(list, false).find((p) => p.key === 'alex');
    expect(alex?.ious.map((i) => i.id)).toEqual(['2', '1']);
    expect(alex?.open).toHaveLength(2);
  });

  it('puts overdue first, then open by name, and hides settled', () => {
    expect(groupPeople(list, false).map((p) => p.name)).toEqual([
      'Dee',
      'Alex',
      'Bea',
    ]);
  });

  it('lists settled people last when asked', () => {
    const people = groupPeople(list, true);
    expect(people.map((p) => p.name)).toEqual(['Dee', 'Alex', 'Bea', 'Cy']);
    expect(people.at(-1)?.settled).toBe(true);
  });

  it('splits open IOUs by direction and flags a write-off offer', () => {
    const people = groupPeople(
      [
        iou({ id: '1', person: 'Bea', direction: 'owed-by-me' }),
        iou({ id: '2', person: 'Bea', writeOffOffered: true }),
      ],
      false,
    );
    expect(people[0]?.owedByMe).toHaveLength(1);
    expect(people[0]?.owedToMe).toHaveLength(1);
    expect(people[0]?.writeOffOffered).toBe(true);
  });
});

describe('counts', () => {
  const list = [
    iou({ id: '1', overdue: true, daysOverdue: 2 }),
    iou({ id: '2', settled: true, overdue: true }),
    iou({ id: '3' }),
  ];

  it('counts open and overdue ones', () => {
    expect(openCount(list)).toBe(2);
    expect(overdueCount(list)).toBe(1);
  });
});

describe('soleOpen', () => {
  it('is the only open IOU, else null', () => {
    const [one] = groupPeople([iou({ id: '1' })], false);
    const [many] = groupPeople([iou({ id: '1' }), iou({ id: '2' })], false);
    expect(one && soleOpen(one)?.id).toBe('1');
    expect(many && soleOpen(many)).toBeNull();
  });
});

describe('personKey', () => {
  it('trims and lower-cases', () => {
    expect(personKey('  Alex ')).toBe('alex');
  });
});

describe('personFigure', () => {
  it("uses the server's per-person total when IOUs run one way", () => {
    const total = money(9000, 'USD');
    const [alex] = groupPeople(
      [
        iou({ id: '1', personOpen: { count: 2, outstanding: total } }),
        iou({ id: '2', personOpen: { count: 2, outstanding: total } }),
      ],
      false,
    );
    expect(alex && personFigure(alex)).toEqual({ amount: total, toMe: true });
  });

  it('is null when IOUs run both ways', () => {
    const [alex] = groupPeople(
      [iou({ id: '1' }), iou({ id: '2', direction: 'owed-by-me' })],
      false,
    );
    expect(alex && personFigure(alex)).toBeNull();
  });

  it('is the settled zero when nothing is open', () => {
    const zero = money(0, 'USD');
    const [cy] = groupPeople(
      [iou({ id: '1', settled: true, outstanding: zero })],
      true,
    );
    expect(cy && personFigure(cy)?.amount).toEqual(zero);
  });
});

describe('nextDue', () => {
  it('is the earliest due date among open IOUs', () => {
    const [alex] = groupPeople(
      [
        iou({ id: '1', dueOn: localDate('2026-11-02') }),
        iou({ id: '2', dueOn: localDate('2026-10-20') }),
        iou({ id: '3' }),
      ],
      false,
    );
    expect(alex && nextDue(alex)).toBe('2026-10-20');
  });
});

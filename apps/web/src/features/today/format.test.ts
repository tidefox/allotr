import { localDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  formatDay,
  formatTerminalDate,
  formatTerminalDay,
  formatTerminalWeekday,
} from './format.ts';

describe('formatTerminalDay', () => {
  it('reads weekday, month and a two-digit day in lower case', () => {
    expect(formatTerminalDay(localDate('2026-10-09'), 'en')).toBe('fri oct 09');
    expect(formatTerminalDay(localDate('2026-03-23'), 'en')).toBe('mon mar 23');
  });
  it('is not shifted by the time zone', () => {
    expect(formatTerminalDay(localDate('2026-01-01'), 'en')).toBe('thu jan 01');
  });
});

describe('formatDay', () => {
  it('reads month and day', () => {
    expect(formatDay(localDate('2026-04-01'), 'en')).toBe('Apr 1');
  });
});

describe('formatTerminalDate and formatTerminalWeekday', () => {
  it('read a lower-case month or weekday and a two-digit day', () => {
    expect(formatTerminalDate(localDate('2026-10-02'), 'en')).toBe('oct 02');
    expect(formatTerminalWeekday(localDate('2026-10-10'), 'en')).toBe('sat 10');
  });
});

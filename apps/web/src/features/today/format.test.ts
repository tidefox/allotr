import { localDate } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { formatDay, formatTerminalDay } from './format.ts';

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

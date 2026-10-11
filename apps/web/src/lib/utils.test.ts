import { describe, expect, it } from 'vitest';
import { cn } from './utils.ts';

describe('cn', () => {
  it('keeps a text size next to a text colour', () => {
    expect(cn('text-small', 'text-text-muted')).toBe(
      'text-small text-text-muted',
    );
    expect(cn('text-title text-primary')).toBe('text-title text-primary');
  });
  it('lets a later size or colour win', () => {
    expect(cn('text-small', 'text-tiny')).toBe('text-tiny');
    expect(cn('text-text', 'text-primary')).toBe('text-primary');
  });
});

describe('cn and line heights', () => {
  it('keeps a line height set after the size', () => {
    expect(cn('text-stat', 'leading-[1.45]')).toBe('text-stat leading-[1.45]');
  });
});

import { describe, expect, it } from 'vitest';
import { shareText } from './share-text';

describe('shareText', () => {
  it('writes basis points as whole percents', () => {
    expect(shareText(0)).toBe('0%');
    expect(shareText(-5)).toBe('0%');
    expect(shareText(40)).toBe('<1%');
    expect(shareText(3460)).toBe('35%');
    expect(shareText(10000)).toBe('100%');
  });
});

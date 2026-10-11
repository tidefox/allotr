import { describe, expect, it } from 'vitest';
import { progressText, shareText } from './share-text';

describe('shareText', () => {
  it('writes basis points as whole percents', () => {
    expect(shareText(0)).toBe('0%');
    expect(shareText(-5)).toBe('0%');
    expect(shareText(40)).toBe('<1%');
    expect(shareText(3460)).toBe('35%');
    expect(shareText(10000)).toBe('100%');
  });
});

describe('progressText', () => {
  it('rounds the server basis points down to whole percents', () => {
    expect(progressText(0)).toBe('0%');
    expect(progressText(2_500)).toBe('25%');
    expect(progressText(3_333)).toBe('33%');
    expect(progressText(10_000)).toBe('100%');
  });

  it('never shows 100% before the goal is reached', () => {
    expect(progressText(9_999)).toBe('99%');
    expect(progressText(9_950)).toBe('99%');
  });
});

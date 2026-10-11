import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { CODE_PATTERN, endsCodeChallenge, isInvalidInvite } from './auth-model';

function problem(status: number, code?: string) {
  return new ApiError({
    type: 'about:blank',
    title: 'Title',
    status,
    ...(code === undefined ? {} : { code }),
  });
}

describe('endsCodeChallenge', () => {
  it('is true only for the too-many-attempts problem', () => {
    expect(
      endsCodeChallenge(problem(401, 'too_many_attempts_request_new_code')),
    ).toBe(true);
    expect(endsCodeChallenge(problem(401, 'invalid_code'))).toBe(false);
    expect(endsCodeChallenge(new Error('boom'))).toBe(false);
  });
});

describe('isInvalidInvite', () => {
  it('treats a 404 as an unusable link and anything else as a failure', () => {
    expect(isInvalidInvite(problem(404))).toBe(true);
    expect(isInvalidInvite(problem(500))).toBe(false);
    expect(isInvalidInvite(new Error('offline'))).toBe(false);
  });
});

describe('CODE_PATTERN', () => {
  const matches = (value: string) =>
    new RegExp(`^(?:${CODE_PATTERN})$`, 'v').test(value);

  it('accepts a TOTP code and a hyphenated backup code', () => {
    expect(matches('123456')).toBe(true);
    expect(matches('123 456')).toBe(true);
    expect(matches('ab12c-9z8y7')).toBe(true);
  });

  it('rejects short codes and stray symbols', () => {
    expect(matches('12345')).toBe(false);
    expect(matches('12345!')).toBe(false);
  });
});

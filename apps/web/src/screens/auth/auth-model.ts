import { ApiError } from '@/lib/api';

// Pure helpers for the auth screens.

/**
 * Too many wrong codes end the two-factor challenge: the only way on is the
 * password again.
 */
export function endsCodeChallenge(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.problem.code === 'too_many_attempts_request_new_code'
  );
}

/** An invite link the server does not know (used, expired or never issued). */
export function isInvalidInvite(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * A TOTP code (6 digits) or a backup code (letters and digits around a
 * hyphen), with spaces allowed in between.
 */
export const CODE_PATTERN = '[\\sA-Za-z0-9\\-]{6,24}';

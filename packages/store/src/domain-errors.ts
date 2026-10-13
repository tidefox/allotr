import { LedgerError, type LedgerErrorCode } from '@allotr/core';
import { DateError, MoneyError } from '@allotr/shared';

// Domain errors from core and shared become problem details with the error's
// stable code, minus its namespace (code-style rule "Errors").

/**
 * An error status the API can answer with (types only, no HTTP code). The
 * members match the 4xx and 5xx unions of the HTTP framework, so the server
 * can pass one straight to it.
 */
export type ProblemStatus =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 407
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 428
  | 429
  | 431
  | 451
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511;

const ledgerStatus: Record<LedgerErrorCode, ProblemStatus> = {
  'ledger.unbalanced': 400,
  'ledger.invalid_transaction': 400,
  'ledger.currency_mismatch': 400,
  'ledger.unknown_account': 404,
  'ledger.account_archived': 409,
  'ledger.posting_count': 400,
  'ledger.zero_amount': 400,
  'ledger.invalid_amount': 400,
  'ledger.invalid_split': 400,
  'ledger.split_mismatch': 400,
  'ledger.same_account': 400,
  'ledger.not_a_user_account': 400,
  // The server creates system accounts before it builds an entry.
  'ledger.missing_system_account': 500,
  'ledger.budget_group_unchanged': 409,
  'ledger.not_found': 404,
  'ledger.already_reversed': 409,
  'ledger.reversal_of_reversal': 409,
  'ledger.not_undone': 409,
  'ledger.out_of_time_order': 409,
  'ledger.different_day': 400,
};

export type PathError = Readonly<{ path: string; message: string }>;

/** A refusal from a server rule, such as a name already in use. */
export class RequestProblem extends Error {
  override readonly name = 'RequestProblem';
  readonly status: ProblemStatus;
  readonly code: string;
  /** Where in the request it went wrong, as JSON Pointers. */
  readonly errors: readonly PathError[] | undefined;

  constructor(
    status: ProblemStatus,
    code: string,
    detail: string,
    errors?: readonly PathError[],
  ) {
    super(detail);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export type DomainError = LedgerError | MoneyError | DateError | RequestProblem;

export function isDomainError(error: unknown): error is DomainError {
  return (
    error instanceof LedgerError ||
    error instanceof MoneyError ||
    error instanceof DateError ||
    error instanceof RequestProblem
  );
}

/** Status, stable code and message for a domain error. */
export function describeDomainError(error: DomainError): {
  status: ProblemStatus;
  code: string;
  detail: string;
} {
  if (error instanceof RequestProblem) {
    return { status: error.status, code: error.code, detail: error.message };
  }
  const status = error instanceof LedgerError ? ledgerStatus[error.code] : 400;
  return {
    status,
    code: error.code.replace(/^ledger\./, '').replace('.', '_'),
    detail:
      status === 500 ? 'The ledger could not record this.' : error.message,
  };
}

/** The same refusal, pointing at the request item it came from. */
export function atPath(error: DomainError, path: string): RequestProblem {
  const { status, code, detail } = describeDomainError(error);
  return new RequestProblem(status, code, detail, [{ path, message: detail }]);
}

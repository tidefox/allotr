import { STATUS_CODES } from 'node:http';
import type { ProblemDetails } from '@allotr/shared';
import type { Context } from 'hono';
import {
  type DomainError,
  describeDomainError,
  RequestProblem,
  type ProblemStatus,
} from '@allotr/store';

export type { ProblemStatus };

// Builds an RFC 9457 body. Plain HTTP errors use `about:blank`, whose title
// is the status phrase.
export function problemBody(
  status: ProblemStatus,
  extra: Omit<ProblemDetails, 'type' | 'title' | 'status'> = {},
): ProblemDetails {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...extra,
  };
}

export function problem<S extends ProblemStatus>(
  c: Context,
  status: S,
  extra?: Omit<ProblemDetails, 'type' | 'title' | 'status'>,
) {
  return c.json(problemBody(status, extra), status, {
    'content-type': 'application/problem+json',
  });
}

/** A domain error as a problem response, with its stable code. */
export function domainProblem(c: Context, error: DomainError) {
  const { status, code, detail } = describeDomainError(error);
  const errors = error instanceof RequestProblem ? error.errors : undefined;
  return problem(c, status, {
    detail,
    code,
    ...(errors === undefined ? {} : { errors: [...errors] }),
  });
}

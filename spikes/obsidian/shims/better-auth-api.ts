// Stands in for `better-auth/api`: app.ts only tests `instanceof APIError`.
export class APIError extends Error {
  statusCode = 500;
  body?: { message?: string; code?: string };
}

export type ClientIpResolver = (
  socket: string | undefined,
  forwardedFor: string | null,
) => string | undefined;
export const createClientIpResolver = (): ClientIpResolver => () => undefined;

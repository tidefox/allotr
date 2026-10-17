// Web Push makes no sense inside a notes app; the routes answer with errors.
const unavailable = (): never => {
  throw new Error('Push notifications are not available in the plugin.');
};
export type PushMessage = unknown;
export type PushSender = unknown;
export type Delivery = unknown;
export const createSender = unavailable;
// The scheduler's reminder job calls this after recording a reminder: nothing is sent.
export const pushToUser = (): Promise<{ sent: number; removed: number; failed: number }> =>
  Promise.resolve({ sent: 0, removed: 0, failed: 0 });
export const addSubscription = unavailable;

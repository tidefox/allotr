// Web Push makes no sense inside a notes app; the routes answer with errors.
const unavailable = (): never => {
  throw new Error('Push notifications are not available in the plugin.');
};
export type PushMessage = unknown;
export type PushSender = unknown;
export type Delivery = unknown;
export const createSender = unavailable;
export const pushToUser = unavailable;
export const addSubscription = unavailable;

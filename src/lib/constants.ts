/**
 * Values shared by the browser and the server. Kept free of server-only
 * imports so the client bundle never drags in Redis or the Resend SDK.
 */

/** Longest message she can leave; also enforced server-side. */
export const MESSAGE_MAX_LENGTH = 100;

/** Browser id cookie set by the proxy, and the header it forwards it on. */
export const DEVICE_COOKIE = "dv";
export const DEVICE_HEADER = "x-device-id";

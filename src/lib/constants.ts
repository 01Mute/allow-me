/**
 * Values shared by the browser and the server. Kept free of server-only
 * imports so the client bundle never drags in Redis or the Resend SDK.
 */

/** Longest message she can leave; also enforced server-side. */
export const MESSAGE_MAX_LENGTH = 100;

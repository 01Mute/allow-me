import { Resend } from "resend";
import { emailFrom, env } from "./env";

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env("RESEND_API_KEY"));
  return client;
}

/** Reset the memoized client. Tests only. */
export function resetEmailClient(): void {
  client = null;
}

async function send(subject: string, text: string): Promise<void> {
  // The Resend SDK reports failures in the payload rather than throwing.
  const { error } = await resend().emails.send({
    from: emailFrom(),
    to: env("NOTIFY_EMAIL_TO"),
    subject,
    text,
  });
  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}

/**
 * The backup copy of a button press. Sent on every press regardless of whether
 * KakaoTalk succeeded, because a press that goes unnoticed is the one failure
 * this project cannot recover from.
 */
export function sendPressEmail(subject: string, body: string): Promise<void> {
  return send(subject, body);
}

/** Operational warnings for the owner: token expiring, refresh failing, etc. */
export function sendAdminAlert(subject: string, body: string): Promise<void> {
  return send(`[알림 버튼] ${subject}`, body);
}

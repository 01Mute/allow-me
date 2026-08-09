import { Resend } from "resend";
import { emailFrom, env } from "./env";

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env("RESEND_API_KEY"));
  return client;
}

/**
 * The backup copy of a button press. Sent on every press regardless of whether
 * Telegram succeeded, because a press that goes unnoticed is the one failure
 * this project cannot recover from.
 */
export async function sendPressEmail(subject: string, body: string): Promise<void> {
  // The Resend SDK reports failures in the payload rather than throwing.
  const { error } = await resend().emails.send({
    from: emailFrom(),
    to: env("NOTIFY_EMAIL_TO"),
    subject,
    text: body,
  });
  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}

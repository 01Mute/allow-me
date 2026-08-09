/**
 * Telegram Bot API delivery.
 *
 * Docs verified 2026-08-09: POST https://api.telegram.org/bot<token>/sendMessage
 * with `chat_id` and `text`. Responses are `{ok: true, result: {...}}` or
 * `{ok: false, error_code, description}` — a failed send can still be HTTP 200,
 * so the body has to be checked either way.
 *
 * Unlike Kakao there is no OAuth and nothing that expires: a bot token stays
 * valid until it is revoked, which is the whole reason this replaced Kakao.
 */

import { env } from "./env";

/** Telegram rejects messages longer than this. */
export const TELEGRAM_TEXT_LIMIT = 4096;

export class TelegramError extends Error {
  readonly detail: string;

  constructor(message: string, detail = "") {
    super(message);
    this.name = "TelegramError";
    this.detail = detail;
  }
}

interface TelegramResponse {
  ok: boolean;
  error_code?: number;
  description?: string;
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env("TELEGRAM_CHAT_ID"),
        text: text.slice(0, TELEGRAM_TEXT_LIMIT),
        // The link in the message body is for me, not for a preview card.
        link_preview_options: { is_disabled: true },
      }),
      cache: "no-store",
    },
  );

  const body = await response.text();
  let parsed: TelegramResponse | null = null;
  try {
    parsed = JSON.parse(body) as TelegramResponse;
  } catch {
    /* handled below */
  }

  if (!parsed?.ok) {
    throw new TelegramError(
      `Telegram sendMessage failed (HTTP ${response.status}${
        parsed?.error_code ? `, code ${parsed.error_code}` : ""
      })`,
      (parsed?.description ?? body).slice(0, 500),
    );
  }
}

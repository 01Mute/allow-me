/**
 * Delivering a button press.
 *
 * Both channels are attempted on every press and neither can prevent the other:
 * Telegram is the one the owner will actually see first, email is the safety net
 * for a revoked bot token or a Telegram outage. Whatever happens, the press is
 * written to the log so it can be recovered by hand.
 */

import { sendTelegramMessage } from "./telegram";
import { sendPressEmail } from "./email";
import { KEYS, redis } from "./redis";
import { siteUrl } from "./env";
import { MESSAGE_MAX_LENGTH } from "./constants";

/** Keep the most recent presses; the list is only ever read by the owner. */
const PRESS_LOG_LIMIT = 200;

export interface PressLogEntry {
  at: string;
  message: string;
  telegram: "ok" | string;
  email: "ok" | string;
  ip?: string;
  userAgent?: string;
}

export interface NotifyResult {
  telegram: "ok" | string;
  email: "ok" | string;
}

export function formatKst(date: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function buildTelegramText(message: string, now: Date): string {
  const quoted = message ? `\n\n"${message}"` : "";
  return `💌 버튼이 눌렸어요${quoted}\n\n${formatKst(now)}`;
}

function buildEmailBody(message: string, now: Date, meta: PressMeta): string {
  return [
    "버튼이 눌렸습니다.",
    "",
    `시각: ${formatKst(now)} (KST)`,
    `메시지: ${message || "(없음)"}`,
    "",
    `사이트: ${siteUrl()}`,
    `IP: ${meta.ip ?? "unknown"}`,
    `User-Agent: ${meta.userAgent ?? "unknown"}`,
  ].join("\n");
}

function describeFailure(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return String(reason);
}

export interface PressMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Never throws. A caller that reaches this function has already decided the
 * press is legitimate, and the person who pressed the button should not be
 * shown an error for an infrastructure problem on our side.
 */
export async function notifyPress(
  rawMessage: string,
  meta: PressMeta = {},
): Promise<NotifyResult> {
  const now = new Date();
  const message = rawMessage.trim().slice(0, MESSAGE_MAX_LENGTH);

  const [telegramResult, emailResult] = await Promise.allSettled([
    sendTelegramMessage(buildTelegramText(message, now)),
    sendPressEmail("💌 버튼이 눌렸습니다", buildEmailBody(message, now, meta)),
  ]);

  const result: NotifyResult = {
    telegram:
      telegramResult.status === "fulfilled" ? "ok" : describeFailure(telegramResult.reason),
    email: emailResult.status === "fulfilled" ? "ok" : describeFailure(emailResult.reason),
  };

  // The press log is the primary record, but it lives in Redis — if Redis is
  // the thing that broke, the runtime log is all that is left.
  if (result.telegram !== "ok") console.error("Telegram delivery failed:", result.telegram);
  if (result.email !== "ok") console.error("Email delivery failed:", result.email);

  await appendPressLog({ at: now.toISOString(), message, ...meta, ...result });
  return result;
}

/** Logging must not take the press down with it, so failures are swallowed. */
export async function appendPressLog(entry: PressLogEntry): Promise<void> {
  try {
    const client = redis();
    await client.lpush(KEYS.pressLog, JSON.stringify(entry));
    await client.ltrim(KEYS.pressLog, 0, PRESS_LOG_LIMIT - 1);
  } catch (error) {
    console.error("Failed to append press log", error);
  }
}

export async function readPressLog(limit = 50): Promise<PressLogEntry[]> {
  const raw = await redis().lrange<string | PressLogEntry>(KEYS.pressLog, 0, limit - 1);
  return raw.map((item) =>
    typeof item === "string" ? (JSON.parse(item) as PressLogEntry) : item,
  );
}

export async function clearPressLog(): Promise<void> {
  await redis().del(KEYS.pressLog);
}

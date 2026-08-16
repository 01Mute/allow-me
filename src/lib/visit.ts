/**
 * Telling me when someone opens the link.
 *
 * This is ordinary server-side access logging — the same IP every web server
 * records on every request — routed to Telegram instead of a log file. It is
 * deliberately quieter than a press: Telegram only, no email, and heavily
 * filtered, because a notification that fires on every fetch is noise rather
 * than a signal.
 */

import { optionalEnv } from "./env";
import { KEYS, redis } from "./redis";
import { sendTelegramMessage } from "./telegram";
import { formatKst } from "./notify";
import { DEVICE_HEADER } from "./constants";

/** One alert per address per this long, so refreshes don't fire a burst. */
const THROTTLE_SECONDS = 30 * 60;
const VISIT_LOG_LIMIT = 200;
const USER_AGENT_MAX = 120;

/**
 * Link-preview crawlers are the reason this filter exists. Sending the link in
 * KakaoTalk makes Kakao fetch the page to build the preview card — without this
 * I would get "she opened it" the instant I sent it to her.
 */
const BOT_PATTERN =
  /bot|crawl|spider|scrap|preview|fetch|monitor|probe|headless|lighthouse|curl|wget|python-requests|okhttp|axios|node-fetch|facebookexternalhit|slack|discord|whatsapp|line-poker|daum|yeti|vercel|uptime/i;

export interface VisitInfo {
  ip: string;
  userAgent: string;
  country?: string;
  region?: string;
  city?: string;
  referer?: string;
  /** Browser id from the proxy cookie — this is how a revisit is recognised. */
  deviceId?: string;
  /** True when the proxy had to mint the id, i.e. no cookie came back. */
  newDevice?: boolean;
}

/**
 * Must be called during the request, never inside `after` — a Server Component
 * cannot reach request APIs from there, so the values get read up front and
 * passed along.
 */
export function readVisitInfo(headers: Headers): VisitInfo {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : (headers.get("x-real-ip") ?? "unknown");

  // Vercel resolves these at the edge; city arrives percent-encoded.
  const decode = (value: string | null): string | undefined => {
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  return {
    ip,
    userAgent: headers.get("user-agent") ?? "unknown",
    country: decode(headers.get("x-vercel-ip-country")),
    region: decode(headers.get("x-vercel-ip-country-region")),
    city: decode(headers.get("x-vercel-ip-city")),
    referer: headers.get("referer") ?? undefined,
    deviceId: headers.get(DEVICE_HEADER) ?? undefined,
    newDevice: headers.get(`${DEVICE_HEADER}-new`) === "1",
  };
}

export function isBot(userAgent: string): boolean {
  return BOT_PATTERN.test(userAgent);
}

/** Addresses to stay quiet about — mine, mostly. */
export function isIgnoredIp(ip: string): boolean {
  return optionalEnv("VISIT_IGNORE_IPS", "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(ip);
}

export function describeLocation(info: VisitInfo): string {
  const parts = [info.city, info.region, info.country].filter(Boolean);
  return parts.length ? parts.join(" · ") : "알 수 없음";
}

/** "같은 기기인가?" — the whole point of the device cookie. */
export function describeDevice(info: VisitInfo, deviceVisits: number): string {
  if (!info.deviceId) return "알 수 없음";
  const short = info.deviceId.slice(0, 8);
  return deviceVisits <= 1
    ? `처음 보는 기기 (${short})`
    : `전에 왔던 그 기기 (${short}, ${deviceVisits}번째)`;
}

export function buildVisitText(
  info: VisitInfo,
  at: Date,
  totalVisits: number,
  deviceVisits: number,
): string {
  return [
    "👀 링크를 열어봤어요",
    "",
    `시각: ${formatKst(at)}`,
    `기기 확인: ${describeDevice(info, deviceVisits)}`,
    `위치: ${describeLocation(info)}`,
    `IP: ${info.ip}`,
    `UA: ${info.userAgent.slice(0, USER_AGENT_MAX)}`,
    "",
    `누적 방문: ${totalVisits}회`,
  ].join("\n");
}

export interface VisitLogEntry extends VisitInfo {
  at: string;
  deviceVisits: number;
  notified: boolean;
}

/**
 * Never throws and never blocks the page — a failure here must not cost her
 * the page load.
 */
export async function notifyVisit(info: VisitInfo): Promise<void> {
  try {
    if (isBot(info.userAgent) || isIgnoredIp(info.ip)) return;

    const client = redis();
    const at = new Date();

    // Counted on every real load, even when the alert itself is throttled.
    const totalVisits = await client.incr(KEYS.visitCount);
    const deviceVisits = info.deviceId ? await client.incr(KEYS.deviceCount(info.deviceId)) : 0;

    // Throttle per browser, not per address. Keying on IP would silence a
    // second device on the same wifi — which is the case worth hearing about.
    const throttleKey = info.deviceId ? `d:${info.deviceId}` : info.ip;
    const fresh = await client.set(KEYS.visitSeen(throttleKey), at.toISOString(), {
      nx: true,
      ex: THROTTLE_SECONDS,
    });

    await client.lpush(
      KEYS.visitLog,
      JSON.stringify({
        ...info,
        at: at.toISOString(),
        deviceVisits,
        notified: fresh !== null,
      }),
    );
    await client.ltrim(KEYS.visitLog, 0, VISIT_LOG_LIMIT - 1);

    if (fresh !== null) {
      await sendTelegramMessage(buildVisitText(info, at, totalVisits, deviceVisits));
    }
  } catch (error) {
    console.error("Visit notification failed", error);
  }
}

export async function readVisitLog(limit = 50): Promise<VisitLogEntry[]> {
  const raw = await redis().lrange<string | VisitLogEntry>(KEYS.visitLog, 0, limit - 1);
  return raw.map((item) =>
    typeof item === "string" ? (JSON.parse(item) as VisitLogEntry) : item,
  );
}

export async function readVisitCount(): Promise<number> {
  return (await redis().get<number>(KEYS.visitCount)) ?? 0;
}

export async function clearVisits(): Promise<void> {
  const client = redis();
  // Drop the per-browser counters too, or a device cleared from the log still
  // reports itself as a returning visitor next time.
  const entries = await readVisitLog(VISIT_LOG_LIMIT).catch(() => []);
  const deviceIds = [...new Set(entries.map((e) => e.deviceId).filter(Boolean))];
  await Promise.all(deviceIds.map((id) => client.del(KEYS.deviceCount(id as string))));

  await client.del(KEYS.visitLog);
  await client.del(KEYS.visitCount);
}

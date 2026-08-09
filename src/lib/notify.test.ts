import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown[]>());
const sendTelegramMessage = vi.hoisted(() => vi.fn());
const sendPressEmail = vi.hoisted(() => vi.fn());

// Partial mock: the real TELEGRAM_TEXT_LIMIT is what the length assertion below
// needs to be checking against.
vi.mock("./telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./telegram")>()),
  sendTelegramMessage,
}));
vi.mock("./email", () => ({ sendPressEmail }));
vi.mock("./redis", () => ({
  KEYS: { pressLog: "press:log" },
  redis: () => ({
    lpush: async (key: string, value: unknown) => {
      const list = store.get(key) ?? [];
      list.unshift(value);
      store.set(key, list);
      return list.length;
    },
    ltrim: async () => "OK",
    lrange: async (key: string) => store.get(key) ?? [],
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  }),
}));

import { buildTelegramText, formatKst, notifyPress, readPressLog } from "./notify";
import { TELEGRAM_TEXT_LIMIT } from "./telegram";

beforeEach(() => {
  store.clear();
  sendTelegramMessage.mockReset().mockResolvedValue(undefined);
  sendPressEmail.mockReset().mockResolvedValue(undefined);
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

describe("notifyPress", () => {
  it("sends both channels and logs success", async () => {
    const result = await notifyPress("보고 싶어");

    expect(sendTelegramMessage).toHaveBeenCalledOnce();
    expect(sendPressEmail).toHaveBeenCalledOnce();
    expect(result).toEqual({ telegram: "ok", email: "ok" });

    const [entry] = await readPressLog();
    expect(entry).toMatchObject({ message: "보고 싶어", telegram: "ok", email: "ok" });
  });

  it("still sends the email when Telegram fails", async () => {
    // The whole point of the backup channel: a revoked bot token must not
    // swallow the press.
    sendTelegramMessage.mockRejectedValue(new Error("unauthorized"));

    const result = await notifyPress("마음이 생겼어");

    expect(sendPressEmail).toHaveBeenCalledOnce();
    expect(result.email).toBe("ok");
    expect(result.telegram).toContain("unauthorized");
  });

  it("still sends Telegram when the email fails", async () => {
    sendPressEmail.mockRejectedValue(new Error("resend down"));

    const result = await notifyPress("");

    expect(sendTelegramMessage).toHaveBeenCalledOnce();
    expect(result.telegram).toBe("ok");
    expect(result.email).toContain("resend down");
  });

  it("records the press even when both channels fail", async () => {
    sendTelegramMessage.mockRejectedValue(new Error("telegram down"));
    sendPressEmail.mockRejectedValue(new Error("resend down"));

    await expect(notifyPress("혹시")).resolves.toBeDefined();

    const [entry] = await readPressLog();
    expect(entry.message).toBe("혹시");
    expect(entry.telegram).toContain("telegram down");
    expect(entry.email).toContain("resend down");
  });

  it("trims and caps the message", async () => {
    await notifyPress(`   ${"가".repeat(300)}   `);

    const [entry] = await readPressLog();
    expect(entry.message).toHaveLength(100);
  });

  it("keeps the message text within Telegram's length limit", async () => {
    await notifyPress("나".repeat(100));

    const text = sendTelegramMessage.mock.calls[0][0] as string;
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
  });
});

describe("buildTelegramText", () => {
  it("omits the quote block when no message was written", () => {
    const text = buildTelegramText("", new Date("2026-08-09T12:00:00Z"));
    expect(text).not.toContain('"');
  });

  it("includes the message when one was written", () => {
    const text = buildTelegramText("보고 싶어", new Date("2026-08-09T12:00:00Z"));
    expect(text).toContain('"보고 싶어"');
  });
});

describe("formatKst", () => {
  it("renders UTC instants in Seoul time", () => {
    expect(formatKst(new Date("2026-08-09T12:00:00Z"))).toBe("2026-08-09 21:00");
  });

  it("rolls over the date at the KST day boundary", () => {
    expect(formatKst(new Date("2026-08-09T15:30:00Z"))).toBe("2026-08-10 00:30");
  });
});

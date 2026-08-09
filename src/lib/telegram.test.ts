import { beforeEach, describe, expect, it, vi } from "vitest";
import { TELEGRAM_TEXT_LIMIT, TelegramError, sendTelegramMessage } from "./telegram";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A fetch stub whose recorded calls keep their argument types. */
function fetchReturning(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    jsonResponse(body, status),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.TELEGRAM_BOT_TOKEN = "123456:TEST-TOKEN";
  process.env.TELEGRAM_CHAT_ID = "987654321";
});

describe("sendTelegramMessage", () => {
  it("posts the text to the bot's sendMessage endpoint", async () => {
    const fetchMock = fetchReturning({ ok: true, result: { message_id: 1 } });
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramMessage("버튼이 눌렸어요");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123456:TEST-TOKEN/sendMessage");
    expect(init!.method).toBe("POST");

    const payload = JSON.parse(init!.body as string);
    expect(payload.chat_id).toBe("987654321");
    expect(payload.text).toBe("버튼이 눌렸어요");
  });

  it("truncates text to Telegram's limit", async () => {
    const fetchMock = fetchReturning({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramMessage("가".repeat(TELEGRAM_TEXT_LIMIT + 500));

    const payload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(payload.text).toHaveLength(TELEGRAM_TEXT_LIMIT);
  });

  it("throws when the body says ok:false even on HTTP 200", async () => {
    // Telegram reports some failures with a 200 status, so the status code
    // alone is not enough to call a send successful.
    vi.stubGlobal(
      "fetch",
      fetchReturning({ ok: false, error_code: 400, description: "chat not found" }),
    );

    const error = await sendTelegramMessage("hi").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TelegramError);
    expect((error as TelegramError).detail).toContain("chat not found");
  });

  it("throws on an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      fetchReturning({ ok: false, error_code: 401, description: "Unauthorized" }, 401),
    );

    await expect(sendTelegramMessage("hi")).rejects.toThrow(TelegramError);
  });

  it("throws when the response is not JSON at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502 Bad Gateway</html>", { status: 502 })),
    );

    await expect(sendTelegramMessage("hi")).rejects.toThrow(TelegramError);
  });
});

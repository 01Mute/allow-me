import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("./redis", () => ({
  KEYS: {
    tokens: "kakao:tokens",
    refreshLock: "kakao:refresh_lock",
    refreshStatus: "kakao:refresh_status",
    pressLog: "press:log",
    pressDedupe: "press:dedupe",
    rateLimit: (ip: string) => `press:rate:${ip}`,
  },
  redis: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  }),
}));

import {
  KAKAO_TEXT_LIMIT,
  KakaoError,
  exchangeAuthorizationCode,
  getAccessToken,
  readTokenState,
  refreshTokens,
  sendKakaoMemo,
  writeTokenState,
  type TokenState,
} from "./kakao";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A fetch stub whose recorded calls keep their argument types. */
function fetchReturning(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    jsonResponse(body, status),
  );
}

function connectedState(overrides: Partial<TokenState> = {}): TokenState {
  return {
    refreshToken: "STORED_REFRESH",
    refreshTokenExpiresAt: Date.now() + 40 * DAY,
    connectedAt: Date.now() - 20 * DAY,
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  process.env.KAKAO_REST_API_KEY = "test-rest-key";
  process.env.KAKAO_CLIENT_SECRET = "test-client-secret";
  process.env.KAKAO_REDIRECT_URI = "https://example.test/api/auth/kakao/callback";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

describe("exchangeAuthorizationCode", () => {
  it("stores the refresh token from the first consent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          access_token: "AT1",
          expires_in: 43199,
          refresh_token: "RT1",
          refresh_token_expires_in: 5184000,
        }),
      ),
    );

    const state = await exchangeAuthorizationCode("auth-code");

    expect(state.refreshToken).toBe("RT1");
    expect(state.accessToken).toBe("AT1");
    expect(await readTokenState()).toMatchObject({ refreshToken: "RT1" });
  });

  it("rejects a first consent that returns no refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ access_token: "AT1", expires_in: 43199 })),
    );

    await expect(exchangeAuthorizationCode("auth-code")).rejects.toThrow(KakaoError);
  });
});

describe("refreshTokens", () => {
  it("keeps the existing refresh token when the response omits one", async () => {
    // Kakao only reissues a refresh token in the last month of its life, so an
    // absent refresh_token is the everyday case — losing it here would silently
    // break the whole app.
    await writeTokenState(connectedState());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ access_token: "AT2", expires_in: 43199 })),
    );

    const state = await refreshTokens();

    expect(state.refreshToken).toBe("STORED_REFRESH");
    expect(state.accessToken).toBe("AT2");
    expect(await readTokenState()).toMatchObject({ refreshToken: "STORED_REFRESH" });
  });

  it("rotates the refresh token when Kakao issues a new one", async () => {
    await writeTokenState(connectedState());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          access_token: "AT3",
          expires_in: 43199,
          refresh_token: "ROTATED",
          refresh_token_expires_in: 5184000,
        }),
      ),
    );

    const state = await refreshTokens();

    expect(state.refreshToken).toBe("ROTATED");
    expect(state.refreshTokenExpiresAt).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  it("flags invalid_grant as needing re-consent", async () => {
    await writeTokenState(connectedState());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400)),
    );

    const error = await refreshTokens().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KakaoError);
    expect((error as KakaoError).needsReauth).toBe(true);
  });

  it("does not erase the stored token when the refresh call fails", async () => {
    await writeTokenState(connectedState());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400)),
    );

    await refreshTokens().catch(() => undefined);

    expect(await readTokenState()).toMatchObject({ refreshToken: "STORED_REFRESH" });
  });

  it("reports missing tokens as needing the connect flow", async () => {
    const error = await refreshTokens().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KakaoError);
    expect((error as KakaoError).needsReauth).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("reuses a cached token that is still comfortably valid", async () => {
    await writeTokenState(
      connectedState({ accessToken: "CACHED", accessTokenExpiresAt: Date.now() + HOUR }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getAccessToken()).toBe("CACHED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a token that is about to expire", async () => {
    await writeTokenState(
      connectedState({ accessToken: "NEARLY_DEAD", accessTokenExpiresAt: Date.now() + 60_000 }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ access_token: "FRESH", expires_in: 43199 })),
    );

    expect(await getAccessToken()).toBe("FRESH");
  });

  it("releases the refresh lock even when refreshing throws", async () => {
    await writeTokenState(connectedState());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400)),
    );

    await getAccessToken().catch(() => undefined);

    expect(store.has("kakao:refresh_lock")).toBe(false);
  });
});

describe("sendKakaoMemo", () => {
  beforeEach(async () => {
    await writeTokenState(
      connectedState({ accessToken: "AT", accessTokenExpiresAt: Date.now() + HOUR }),
    );
  });

  it("posts a text template to the memo endpoint", async () => {
    const fetchMock = fetchReturning({ result_code: 0 });
    vi.stubGlobal("fetch", fetchMock);

    await sendKakaoMemo("버튼이 눌렸습니다");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://kapi.kakao.com/v2/api/talk/memo/default/send");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer AT");

    const template = JSON.parse(
      new URLSearchParams(init!.body as string).get("template_object")!,
    );
    expect(template.object_type).toBe("text");
    expect(template.text).toBe("버튼이 눌렸습니다");
    expect(template.link.mobile_web_url).toBe("https://example.test");
  });

  it("truncates text to Kakao's template limit", async () => {
    const fetchMock = fetchReturning({ result_code: 0 });
    vi.stubGlobal("fetch", fetchMock);

    await sendKakaoMemo("가".repeat(500));

    const init = fetchMock.mock.calls[0][1]!;
    const template = JSON.parse(
      new URLSearchParams(init.body as string).get("template_object")!,
    );
    expect(template.text).toHaveLength(KAKAO_TEXT_LIMIT);
  });

  it("throws on a non-zero result_code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ result_code: -1 })),
    );

    await expect(sendKakaoMemo("hi")).rejects.toThrow(KakaoError);
  });

  it("throws on an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ msg: "insufficient scopes", code: -402 }, 403)),
    );

    await expect(sendKakaoMemo("hi")).rejects.toThrow(KakaoError);
  });
});

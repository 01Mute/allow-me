import { describe, expect, it } from "vitest";
import {
  buildVisitText,
  describeDevice,
  describeLocation,
  isBot,
  isIgnoredIp,
  readVisitInfo,
} from "./visit";

/** User agents that must never produce an alert. */
const CRAWLERS = {
  kakaoScrap:
    "Mozilla/5.0 (compatible; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33693)",
  telegram: "TelegramBot (like TwitterBot)",
  facebook: "facebookexternalhit/1.1",
  line: "facebookexternalhit/1.1;line-poker/1.0",
  slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  whatsapp: "WhatsApp/2.23.20.0",
  google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  curl: "curl/8.4.0",
  headless: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
};

/** Real people on real phones. These must always produce an alert. */
const HUMANS = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  // She will almost certainly arrive this way: tapping the link inside the
  // KakaoTalk chat opens KakaoTalk's in-app browser. Filtering this would mean
  // never hearing about the visit that matters most.
  kakaoInAppIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5",
  kakaoInAppAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("isBot", () => {
  it.each(Object.entries(CRAWLERS))("filters %s", (_name, ua) => {
    expect(isBot(ua)).toBe(true);
  });

  it.each(Object.entries(HUMANS))("lets %s through", (_name, ua) => {
    expect(isBot(ua)).toBe(false);
  });

  it("separates Kakao's scraper from Kakao's in-app browser", () => {
    // Both say Kakao; only one is a person.
    expect(isBot(CRAWLERS.kakaoScrap)).toBe(true);
    expect(isBot(HUMANS.kakaoInAppIos)).toBe(false);
  });
});

describe("readVisitInfo", () => {
  it("takes the client address from the front of x-forwarded-for", () => {
    const info = readVisitInfo(
      new Headers({
        "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178",
        "user-agent": HUMANS.iphoneSafari,
      }),
    );
    expect(info.ip).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    const info = readVisitInfo(new Headers({ "x-real-ip": "198.51.100.7" }));
    expect(info.ip).toBe("198.51.100.7");
  });

  it("reports unknown rather than throwing when there is no address", () => {
    expect(readVisitInfo(new Headers()).ip).toBe("unknown");
  });

  it("decodes the percent-encoded city Vercel sends", () => {
    const info = readVisitInfo(
      new Headers({
        "x-vercel-ip-city": "Seongnam-si",
        "x-vercel-ip-country": "KR",
        "x-vercel-ip-country-region": "41",
      }),
    );
    expect(info.city).toBe("Seongnam-si");
    expect(info.country).toBe("KR");
  });

  it("survives a malformed percent-encoding", () => {
    const info = readVisitInfo(new Headers({ "x-vercel-ip-city": "%E0%A4%A" }));
    expect(info.city).toBe("%E0%A4%A");
  });
});

describe("isIgnoredIp", () => {
  it("is empty by default", () => {
    delete process.env.VISIT_IGNORE_IPS;
    expect(isIgnoredIp("203.0.113.9")).toBe(false);
  });

  it("matches an address from the list, whitespace and all", () => {
    process.env.VISIT_IGNORE_IPS = "198.51.100.7 , 203.0.113.9";
    expect(isIgnoredIp("203.0.113.9")).toBe(true);
    expect(isIgnoredIp("192.0.2.1")).toBe(false);
    delete process.env.VISIT_IGNORE_IPS;
  });
});

describe("describeLocation", () => {
  it("joins the parts it has", () => {
    expect(
      describeLocation({
        ip: "1.1.1.1",
        userAgent: "x",
        city: "Seoul",
        region: "11",
        country: "KR",
      }),
    ).toBe("Seoul · 11 · KR");
  });

  it("says so when the edge gave no geo at all", () => {
    expect(describeLocation({ ip: "1.1.1.1", userAgent: "x" })).toBe("알 수 없음");
  });
});

describe("readVisitInfo device id", () => {
  it("picks up the id the proxy forwarded", () => {
    const info = readVisitInfo(
      new Headers({ "x-device-id": "abcdef0123456789", "x-device-id-new": "1" }),
    );
    expect(info.deviceId).toBe("abcdef0123456789");
    expect(info.newDevice).toBe(true);
  });

  it("marks a returning browser as not new", () => {
    const info = readVisitInfo(new Headers({ "x-device-id": "abcdef0123456789" }));
    expect(info.newDevice).toBe(false);
  });
});

describe("describeDevice", () => {
  const base = { ip: "1.1.1.1", userAgent: "x", deviceId: "abcdef0123456789" };

  it("calls the first sighting a new device", () => {
    expect(describeDevice(base, 1)).toContain("처음 보는 기기");
  });

  it("recognises the same browser coming back, with a count", () => {
    const text = describeDevice(base, 3);
    expect(text).toContain("전에 왔던 그 기기");
    expect(text).toContain("3번째");
  });

  it("shortens the id rather than printing the whole thing", () => {
    expect(describeDevice(base, 1)).toContain("abcdef01");
    expect(describeDevice(base, 1)).not.toContain("abcdef0123456789");
  });

  it("admits ignorance when no cookie came through", () => {
    expect(describeDevice({ ip: "1.1.1.1", userAgent: "x" }, 0)).toBe("알 수 없음");
  });
});

describe("buildVisitText", () => {
  it("carries the address, location, device and count", () => {
    const text = buildVisitText(
      {
        ip: "203.0.113.9",
        userAgent: HUMANS.iphoneSafari,
        city: "Seoul",
        country: "KR",
        deviceId: "abcdef0123456789",
      },
      new Date("2026-08-10T03:00:00Z"),
      4,
      2,
    );
    expect(text).toContain("203.0.113.9");
    expect(text).toContain("Seoul · KR");
    expect(text).toContain("2026-08-10 12:00");
    expect(text).toContain("전에 왔던 그 기기");
    expect(text).toContain("누적 방문: 4회");
  });

  it("truncates a long user agent instead of blowing the message limit", () => {
    const text = buildVisitText(
      { ip: "1.1.1.1", userAgent: "M".repeat(500) },
      new Date("2026-08-10T03:00:00Z"),
      1,
      1,
    );
    expect(text.length).toBeLessThan(400);
  });
});

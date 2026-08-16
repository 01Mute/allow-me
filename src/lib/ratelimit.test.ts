import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const counters = vi.hoisted(() => new Map<string, number>());

vi.mock("./redis", () => ({
  KEYS: {
    pressDedupe: (pressId: string) => `press:dedupe:${pressId}`,
    rateLimit: (ip: string) => `press:rate:${ip}`,
  },
  redis: () => ({
    set: async (key: string, value: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    incr: async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    expire: async () => 1,
  }),
}));

import { claimPressSlot, clientIp, rateLimit } from "./ratelimit";

beforeEach(() => {
  store.clear();
  counters.clear();
});

describe("claimPressSlot", () => {
  it("lets a second, different press through straight away", async () => {
    // The bug this replaced: a time-window dedupe swallowed a deliberate
    // re-press after the undo button, so only one notification ever arrived.
    expect(await claimPressSlot("attempt-1", 3600)).toBe(true);
    expect(await claimPressSlot("attempt-2", 3600)).toBe(true);
  });

  it("drops a resend of the same attempt", async () => {
    expect(await claimPressSlot("attempt-1", 3600)).toBe(true);
    expect(await claimPressSlot("attempt-1", 3600)).toBe(false);
  });

  it("allows the press when no id was supplied", async () => {
    // An old client, or one where id generation failed. Delivering twice beats
    // not delivering at all.
    expect(await claimPressSlot("", 3600)).toBe(true);
    expect(await claimPressSlot("", 3600)).toBe(true);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit and blocks past it", async () => {
    const opts = { limit: 3, windowSeconds: 3600 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rateLimit("1.1.1.1", opts)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });

  it("counts each address separately", async () => {
    const opts = { limit: 1, windowSeconds: 3600 };
    expect((await rateLimit("1.1.1.1", opts)).allowed).toBe(true);
    expect((await rateLimit("2.2.2.2", opts)).allowed).toBe(true);
    expect((await rateLimit("1.1.1.1", opts)).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

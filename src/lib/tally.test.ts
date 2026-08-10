import { describe, expect, it } from "vitest";
import { MAX_MARKS, TALLY_EPOCH, daysElapsed, groupMarks } from "./tally";

describe("daysElapsed", () => {
  it("counts the epoch day itself as one", () => {
    expect(daysElapsed(new Date("2026-08-10T03:00:00Z"))).toBe(1);
  });

  it("adds a mark for each following day", () => {
    expect(daysElapsed(new Date("2026-08-11T03:00:00Z"))).toBe(2);
    expect(daysElapsed(new Date("2026-08-20T03:00:00Z"))).toBe(11);
    expect(daysElapsed(new Date("2027-08-10T03:00:00Z"))).toBe(366);
  });

  it("turns over at Seoul midnight, not UTC midnight", () => {
    // 14:59Z is 23:59 the same day in Seoul; one minute later is tomorrow.
    expect(daysElapsed(new Date("2026-08-10T14:59:00Z"))).toBe(1);
    expect(daysElapsed(new Date("2026-08-10T15:00:00Z"))).toBe(2);
  });

  it("still shows one mark before the epoch", () => {
    // A visitor whose request lands early must not see a blank wall.
    expect(daysElapsed(new Date("2026-08-01T03:00:00Z"))).toBe(1);
  });

  it("stops growing at the cap", () => {
    expect(daysElapsed(new Date("2099-01-01T03:00:00Z"))).toBe(MAX_MARKS);
  });

  it("uses the exported epoch by default", () => {
    expect(daysElapsed(new Date(`${TALLY_EPOCH}T12:00:00Z`))).toBe(1);
  });
});

describe("groupMarks", () => {
  it("keeps a partial group at the end", () => {
    expect(groupMarks(1)).toEqual([1]);
    expect(groupMarks(4)).toEqual([4]);
    expect(groupMarks(7)).toEqual([5, 2]);
  });

  it("emits no empty trailing group on an exact multiple", () => {
    expect(groupMarks(5)).toEqual([5]);
    expect(groupMarks(10)).toEqual([5, 5]);
  });

  it("always totals the days it was given", () => {
    for (const total of [1, 3, 5, 23, 100, 366]) {
      expect(groupMarks(total).reduce((sum, n) => sum + n, 0)).toBe(total);
    }
  });
});

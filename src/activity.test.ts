import { describe, expect, it } from "vitest";
import { activityKind, formatDuration, parseActivityDate, summarize } from "./activity";
import type { Activity } from "./types";

describe("activity helpers", () => {
  it("classifies Strava activity types", () => {
    expect(activityKind("Trail Run")).toBe("run");
    expect(activityKind("Mountain Bike Ride")).toBe("ride");
    expect(activityKind("Hike")).toBe("walk");
    expect(activityKind("Weight Training")).toBe("other");
  });

  it("parses the English date format in the export", () => {
    expect(parseActivityDate("Jun 13, 2026, 12:05:09 PM")).toBe("2026-06-13T12:05:09.000Z");
    expect(parseActivityDate("Jun 13, 2026, 12:05:09 AM")).toBe("2026-06-13T00:05:09.000Z");
  });

  it("summarizes activities", () => {
    const activity = (distance: number): Activity => ({
      id: distance, name: "Test", sportType: "Run", kind: "run", distance,
      movingTime: 3600, elevation: 100, startDate: "", polyline: null,
    });
    expect(summarize([activity(1000), activity(2500)])).toEqual({ count: 2, distance: 3500, movingTime: 7200, elevation: 200 });
    expect(formatDuration(7260)).toBe("2h 1m");
  });
});

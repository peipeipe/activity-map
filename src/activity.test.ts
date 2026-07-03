import { describe, expect, it } from "vitest";
import { activityDistanceMeters, activityKind, exportField, formatDuration, number, parseActivityDate, summarize } from "./activity";
import type { Activity } from "./types";

describe("activity helpers", () => {
  it("classifies Strava activity types", () => {
    expect(activityKind("Trail Run")).toBe("run");
    expect(activityKind("Mountain Bike Ride")).toBe("ride");
    expect(activityKind("Hike")).toBe("walk");
    expect(activityKind("Weight Training")).toBe("other");
    expect(activityKind("ランニング")).toBe("run");
    expect(activityKind("ウォーキング")).toBe("walk");
  });

  it("parses the English date format in the export", () => {
    expect(parseActivityDate("Jun 13, 2026, 12:05:09 PM")).toBe("2026-06-13T12:05:09.000Z");
    expect(parseActivityDate("Jun 13, 2026, 12:05:09 AM")).toBe("2026-06-13T00:05:09.000Z");
  });

  it("parses the numeric date format in localized exports", () => {
    expect(parseActivityDate("2026/06/29 20:14:15")).toBe("2026-06-29T20:14:15.000Z");
  });

  it("summarizes activities", () => {
    const activity = (distance: number): Activity => ({
      id: distance, name: "Test", sportType: "Run", kind: "run", distance,
      movingTime: 3600, elevation: 100, startDate: "", polyline: null,
    });
    expect(summarize([activity(1000), activity(2500)])).toEqual({ count: 2, distance: 3500, movingTime: 7200, elevation: 200 });
    expect(formatDuration(7260)).toBe("2h 1m");
  });

  it("reads the meter distance column from Strava exports", () => {
    expect(activityDistanceMeters({ Distance_1: "10007.5", Distance: "10.00" }, 9999)).toBe(10007.5);
    expect(activityDistanceMeters({ "Distance.1": "2500.0", Distance: "2.5" }, 0)).toBe(2500);
    expect(activityDistanceMeters({ "距離_1": "12403.3", "距離": "12.40" }, 0)).toBe(12403.3);
  });

  it("falls back to route distance before the display distance", () => {
    expect(activityDistanceMeters({ Distance: "10.00" }, 10007.5)).toBe(10007.5);
    expect(activityDistanceMeters({ Distance: "10.00" }, 0)).toBe(10000);
  });

  it("parses exported numbers with grouping separators", () => {
    expect(number("1,234.5")).toBe(1234.5);
    expect(number("")).toBe(0);
  });

  it("reads localized export fields by alias", () => {
    expect(exportField({ "ファイル名": "activities/1.fit.gz" }, ["Filename", "ファイル名"])).toBe("activities/1.fit.gz");
    expect(exportField({ Filename: "" }, ["Filename", "ファイル名"])).toBeUndefined();
  });
});

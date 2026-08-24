import { describe, expect, it } from "vitest";
import { ActivityQueryError, compileActivityQuery } from "./activity-query";
import type { Activity } from "./types";

const activities: Activity[] = [
  { id: 1, name: "朝のランニング", sportType: "Run", kind: "run", distance: 10_000, movingTime: 3_000, elevation: 100, startDate: "", polyline: null },
  { id: 2, name: "River Ride", sportType: "Mountain Bike Ride", kind: "ride", distance: 30_000, movingTime: 5_400, elevation: 250, startDate: "", polyline: null },
  { id: 3, name: "Evening Walk", sportType: "Walk", kind: "walk", distance: 4_000, movingTime: 3_600, elevation: 20, startDate: "", polyline: null },
];

function ids(query: string): number[] {
  return activities.filter(compileActivityQuery(query)).map((activity) => activity.id);
}

describe("activity query", () => {
  it("filters numeric fields in display units", () => {
    expect(ids("distance >= 10 AND speed > 15")).toEqual([2]);
    expect(ids("速度 >= 12 AND 距離 = 10")).toEqual([1]);
  });

  it("filters text fields case-insensitively", () => {
    expect(ids("name CONTAINS 'river'")).toEqual([2]);
    expect(ids("type = run")).toEqual([1]);
    expect(ids("type = 'Mountain Bike Ride'")).toEqual([2]);
    expect(ids("name LIKE '%Walk'")).toEqual([3]);
  });

  it("supports SQL statements, parentheses, OR, and NOT", () => {
    expect(ids("SELECT * FROM activities WHERE (type = run OR type = ride) AND NOT distance < 10;")).toEqual([1, 2]);
    expect(ids("SELECT * FROM activities;")).toEqual([1, 2, 3]);
    expect(ids("type <> walk")).toEqual([1, 2]);
    expect(ids("")).toEqual([1, 2, 3]);
  });

  it("handles SQL quote escaping", () => {
    const named = { ...activities[0], name: "Runner's High" };
    expect(compileActivityQuery("name = 'Runner''s High'")(named)).toBe(true);
  });

  it("reports invalid fields and values", () => {
    expect(() => compileActivityQuery("pace > 5")).toThrow(ActivityQueryError);
    expect(() => compileActivityQuery("distance > fast")).toThrow("数値が必要です");
    expect(() => compileActivityQuery("name > 'Run'")).toThrow("name では > を使えません");
  });
});

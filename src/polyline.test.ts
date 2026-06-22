import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline, polylineDistance, simplifyPoints, type Point } from "./polyline";

describe("polyline", () => {
  it("calculates the distance along GPS points in meters", () => {
    expect(polylineDistance([[35, 139], [35.009, 139]])).toBeCloseTo(1001, -1);
    expect(polylineDistance([])).toBe(0);
  });

  it("matches the documented Google polyline example", () => {
    const points: Point[] = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodePolyline(points)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it("removes points close to a straight line", () => {
    const points: Point[] = [[35, 139], [35.00001, 139.00001], [35.001, 139.001]];
    expect(simplifyPoints(points, 10)).toEqual([points[0], points[2]]);
  });

  it("rejects a truncated polyline", () => {
    expect(() => decodePolyline("_")).toThrow("Invalid polyline");
  });
});

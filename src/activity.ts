import type { Activity, ActivityKind } from "./types";

type ExportRow = Record<string, string | undefined>;

export function activityKind(sportType: string): ActivityKind {
  const sport = sportType.toLowerCase();
  if (sport.includes("run") || sport.includes("trail") || sport.includes("ラン")) return "run";
  if (sport.includes("ride") || sport.includes("cycling") || sport.includes("ライド") || sport.includes("サイクリング")) return "ride";
  if (sport.includes("walk") || sport.includes("hike") || sport.includes("ウォーク") || sport.includes("ウォーキング") || sport.includes("ハイク") || sport.includes("ハイキング")) return "walk";
  if (sport.includes("swim") || sport.includes("スイム") || sport.includes("水泳")) return "swim";
  return "other";
}

export function summarize(activities: Activity[]) {
  return activities.reduce(
    (sum, activity) => ({
      count: sum.count + 1,
      distance: sum.distance + activity.distance,
      movingTime: sum.movingTime + activity.movingTime,
      elevation: sum.elevation + activity.elevation,
    }),
    { count: 0, distance: 0, movingTime: 0, elevation: 0 },
  );
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ja-JP").format(date);
}

export function parseActivityDate(value: string): string {
  if (!value) return "";
  const match = value.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/);
  if (match) {
    const [, month, day, year, rawHour, minute, second, period] = match;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let hour = Number(rawHour) % 12;
    if (period === "PM") hour += 12;
    return new Date(Date.UTC(Number(year), months.indexOf(month), Number(day), hour, Number(minute), Number(second))).toISOString();
  }

  const numericMatch = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})$/);
  if (!numericMatch) return value;
  const [, year, month, day, hour, minute, second] = numericMatch;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
}

export function activityDistanceMeters(row: ExportRow, routeDistanceMeters: number): number {
  return number(exportField(row, ["Distance_1", "Distance.1", "距離_1"]))
    || routeDistanceMeters
    || number(exportField(row, ["Distance", "距離"])) * 1000;
}

export function exportField(row: ExportRow, names: string[]): string | undefined {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

export function number(value: string | undefined): number {
  const parsed = Number.parseFloat((value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

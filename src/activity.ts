import type { Activity, ActivityKind } from "./types";

export function activityKind(sportType: string): ActivityKind {
  const sport = sportType.toLowerCase();
  if (sport.includes("run") || sport.includes("trail")) return "run";
  if (sport.includes("ride") || sport.includes("cycling")) return "ride";
  if (sport.includes("walk") || sport.includes("hike")) return "walk";
  if (sport.includes("swim")) return "swim";
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
  if (!match) return value;
  const [, month, day, year, rawHour, minute, second, period] = match;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let hour = Number(rawHour) % 12;
  if (period === "PM") hour += 12;
  return new Date(Date.UTC(Number(year), months.indexOf(month), Number(day), hour, Number(minute), Number(second))).toISOString();
}

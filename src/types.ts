export type ActivityKind = "run" | "ride" | "walk" | "swim" | "other";

export type Activity = {
  id: number;
  name: string;
  sportType: string;
  kind: ActivityKind;
  distance: number;
  movingTime: number;
  elevation: number;
  startDate: string;
  polyline: string | null;
};

export type ImportStats = {
  rows: number;
  imported: number;
  withoutFile: number;
  withoutGps: number;
  failed: number;
};

export type WorkerMessage =
  | { type: "progress"; current: number; total: number; label: string }
  | { type: "complete"; activities: Activity[]; stats: ImportStats }
  | { type: "error"; message: string };

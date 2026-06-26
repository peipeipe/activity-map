/// <reference lib="webworker" />
import { BlobReader, BlobWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js";
import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "fflate";
import Papa from "papaparse";
import { activityDistanceMeters, activityKind, number, parseActivityDate } from "./activity";
import { extractFitPoints } from "./fit";
import { encodePolyline, polylineDistance, simplifyPoints, type Point } from "./polyline";
import type { Activity, ImportStats, WorkerMessage } from "./types";

const MAX_ZIP_SIZE = 8 * 1024 ** 3;
const MAX_ENTRIES = 10_000;
const MAX_TOTAL_UNCOMPRESSED = 4 * 1024 ** 3;
const MAX_ENTRY_SIZE = 512 * 1024 ** 2;
const MAX_CSV_SIZE = 64 * 1024 ** 2;

type CsvRow = Record<string, string>;

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  try {
    const { file } = event.data;
    if (file.size > MAX_ZIP_SIZE) throw new Error("ZIPは8GB以下にしてください");
    const result = await importArchive(file);
    post({ type: "complete", ...result });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : "解析に失敗しました" });
  }
};

async function importArchive(file: File): Promise<{ activities: Activity[]; stats: ImportStats }> {
  const reader = new ZipReader(new BlobReader(file));
  try {
    post({ type: "progress", current: 0, total: 1, label: "ZIPの内容を確認中" });
    const entries = await reader.getEntries();
    validateEntries(entries);
    const files = entries.filter((entry): entry is FileEntry => !entry.directory);
    const byName = new Map(files.map((entry) => [normalizePath(entry.filename), entry]));
    const csvEntry = byName.get("activities.csv");
    if (!csvEntry) throw new Error("activities.csv が見つかりません");
    if ((csvEntry.uncompressedSize ?? 0) > MAX_CSV_SIZE) throw new Error("activities.csv が大きすぎます");

    const csvText = await readEntryText(csvEntry);
    const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new Error(`activities.csv を読めません: ${parsed.errors[0].message}`);
    const rows = parsed.data;
    const activities: Activity[] = [];
    const stats: ImportStats = { rows: rows.length, imported: 0, withoutFile: 0, withoutGps: 0, failed: 0 };

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const filename = normalizePath(row.Filename ?? "");
      if (!filename || !byName.has(filename)) {
        stats.withoutFile++;
        continue;
      }
      try {
        const entry = byName.get(filename)!;
        const blob = await entry.getData(new BlobWriter());
        const compressed = new Uint8Array(await blob.arrayBuffer());
        const raw = filename.endsWith(".gz") ? safeGunzip(compressed, filename) : compressed;
        const points = extractPoints(filename, raw);
        if (!points.length) {
          stats.withoutGps++;
          continue;
        }
        activities.push(buildActivity(row, points));
        stats.imported++;
      } catch (error) {
        console.warn(`Activity ${row["Activity ID"] ?? index} failed`, error);
        stats.failed++;
      }
      if (index % 10 === 0 || index === rows.length - 1) {
        post({ type: "progress", current: index + 1, total: rows.length, label: `${index + 1} / ${rows.length} 件を解析中` });
      }
    }
    activities.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { activities, stats };
  } finally {
    await reader.close();
  }
}

function validateEntries(entries: Entry[]): void {
  if (entries.length > MAX_ENTRIES) throw new Error(`ZIP内のファイル数が上限（${MAX_ENTRIES.toLocaleString()}件）を超えています`);
  let total = 0;
  for (const entry of entries) {
    const size = entry.uncompressedSize ?? 0;
    if (size > MAX_ENTRY_SIZE) throw new Error(`展開後のファイルが大きすぎます: ${entry.filename}`);
    total += size;
    if (total > MAX_TOTAL_UNCOMPRESSED) throw new Error("ZIPの展開後サイズが4GBを超えています");
  }
}

function extractPoints(filename: string, raw: Uint8Array): Point[] {
  if (filename.endsWith(".fit") || filename.endsWith(".fit.gz")) return extractFitPoints(raw);
  if (filename.endsWith(".gpx") || filename.endsWith(".gpx.gz")) return extractGpxPoints(raw);
  throw new Error("未対応のアクティビティ形式です");
}

function safeGunzip(compressed: Uint8Array, filename: string): Uint8Array {
  if (compressed.length < 4) throw new Error(`壊れたGZIPです: ${filename}`);
  const offset = compressed.byteLength - 4;
  const expectedSize = new DataView(compressed.buffer, compressed.byteOffset + offset, 4).getUint32(0, true);
  if (expectedSize > MAX_ENTRY_SIZE) throw new Error(`GZIPの展開後サイズが大きすぎます: ${filename}`);
  const output = gunzipSync(compressed);
  if (output.byteLength > MAX_ENTRY_SIZE) throw new Error(`GZIPの展開後サイズが大きすぎます: ${filename}`);
  return output;
}

function extractGpxPoints(raw: Uint8Array): Point[] {
  const xml = new TextDecoder().decode(raw);
  const document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(xml) as Record<string, unknown>;
  const points: Point[] = [];
  collectTrackPoints(document, points);
  return points;
}

function collectTrackPoints(value: unknown, points: Point[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectTrackPoints(item, points));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "trkpt") {
      const items = Array.isArray(child) ? child : [child];
      for (const item of items) {
        if (item && typeof item === "object") {
          const point = item as Record<string, unknown>;
          const lat = Number(point.lat);
          const lng = Number(point.lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng]);
        }
      }
    } else {
      collectTrackPoints(child, points);
    }
  }
}

function buildActivity(row: CsvRow, points: Point[]): Activity {
  const sportType = row["Activity Type"] ?? "";
  const distance = activityDistanceMeters(row, polylineDistance(points));
  return {
    id: number(row["Activity ID"]),
    name: row["Activity Name"] ?? "",
    sportType,
    kind: activityKind(sportType),
    distance,
    movingTime: Math.round(number(row["Moving Time"])),
    elevation: number(row["Elevation Gain"]),
    startDate: parseActivityDate(row["Activity Date"] ?? ""),
    polyline: encodePolyline(simplifyPoints(points, 10)),
  };
}

async function readEntryText(entry: FileEntry): Promise<string> {
  const blob = await entry.getData(new BlobWriter());
  return new TextDecoder("utf-8").decode(await blob.arrayBuffer()).replace(/^\ufeff/, "");
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

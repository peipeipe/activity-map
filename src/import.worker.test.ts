import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";
import { importArchive } from "./import.worker";

describe("import worker", () => {
  it("imports localized Strava CSV headers", async () => {
    const file = await zipFile({
      "activities.csv": [
        "アクティビティID,アクティビティ実行日,アクティビティ名,アクティビティタイプ,ファイル名,移動時間,距離,距離_1,獲得標高",
        "1,2026/06/29 20:14:15,朝のランニング,ランニング,activities/1.gpx,4555,12.40,12403.3,163",
      ].join("\n"),
      "activities/1.gpx": `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Activity Map">
  <trk><trkseg>
    <trkpt lat="35.0" lon="139.0" />
    <trkpt lat="35.001" lon="139.001" />
  </trkseg></trk>
</gpx>`,
    });

    const result = await importArchive(file);

    expect(result.stats).toEqual({ rows: 1, imported: 1, withoutFile: 0, withoutGps: 0, failed: 0 });
    expect(result.activities[0]).toMatchObject({
      id: 1,
      name: "朝のランニング",
      sportType: "ランニング",
      kind: "run",
      distance: 12403.3,
      movingTime: 4555,
      elevation: 163,
      startDate: "2026-06-29T20:14:15.000Z",
    });
    expect(result.activities[0].polyline).toBeTruthy();
  });
});

async function zipFile(files: Record<string, string>): Promise<File> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const [name, content] of Object.entries(files)) {
    await writer.add(name, new TextReader(content));
  }
  const blob = await writer.close();
  return new File([blob], "export.zip", { type: "application/zip" });
}

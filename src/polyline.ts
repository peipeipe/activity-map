export type Point = [number, number];

export function encodePolyline(points: Point[]): string {
  let previousLat = 0;
  let previousLng = 0;
  let result = "";
  for (const [lat, lng] of points) {
    const latInt = Math.round(lat * 1e5);
    const lngInt = Math.round(lng * 1e5);
    result += encodeSigned(latInt - previousLat) + encodeSigned(lngInt - previousLng);
    previousLat = latInt;
    previousLng = lngInt;
  }
  return result;
}

function encodeSigned(input: number): string {
  let value = input < 0 ? ~(input << 1) : input << 1;
  let output = "";
  while (value >= 0x20) {
    output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  return output + String.fromCharCode(value + 63);
}

export function decodePolyline(value: string | null): Point[] {
  if (!value) return [];
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < value.length) {
    const latValue = decodeValue(value, index);
    index = latValue.index;
    lat += latValue.value;
    const lngValue = decodeValue(value, index);
    index = lngValue.index;
    lng += lngValue.value;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function decodeValue(encoded: string, start: number) {
  let index = start;
  let shift = 0;
  let result = 0;
  let byte: number;
  do {
    if (index >= encoded.length) throw new Error("Invalid polyline");
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  return { index, value: result & 1 ? ~(result >> 1) : result >> 1 };
}

export function simplifyPoints(points: Point[], toleranceMeters = 10): Point[] {
  if (points.length <= 2 || toleranceMeters <= 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let furthest = -1;
    let furthestIndex = -1;
    for (let index = start + 1; index < end; index++) {
      const distance = pointSegmentDistance(points[index], points[start], points[end]);
      if (distance > furthest) {
        furthest = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0 && furthest > toleranceMeters) {
      keep[furthestIndex] = 1;
      stack.push([start, furthestIndex], [furthestIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const meanLat = ((point[0] + start[0] + end[0]) / 3) * (Math.PI / 180);
  const lngScale = 111_320 * Math.cos(meanLat);
  const latScale = 111_320;
  const [px, py] = [point[1] * lngScale, point[0] * latScale];
  const [x1, y1] = [start[1] * lngScale, start[0] * latScale];
  const [x2, y2] = [end[1] * lngScale, end[0] * latScale];
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

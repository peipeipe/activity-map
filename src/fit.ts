import type { Point } from "./polyline";

const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;
const INVALID_SINT32 = 0x7fffffff;

type FieldDefinition = { number: number; size: number; baseType: number };
type MessageDefinition = { globalNumber: number; littleEndian: boolean; fields: FieldDefinition[] };

const BASE_TYPE_SIZE: Record<number, number> = {
  0x00: 1, 0x01: 1, 0x02: 1, 0x03: 2, 0x04: 2, 0x05: 4, 0x06: 4,
  0x07: 1, 0x08: 4, 0x09: 8, 0x0a: 1, 0x0b: 2, 0x0c: 4, 0x0d: 1,
  0x0e: 8, 0x0f: 8, 0x10: 8,
};

export function extractFitPoints(bytes: Uint8Array): Point[] {
  if (bytes.length < 12) throw new Error("FIT file is too short");
  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) throw new Error(`Unsupported FIT header: ${headerSize}`);
  if (String.fromCharCode(...bytes.subarray(8, 12)) !== ".FIT") throw new Error("Invalid FIT signature");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = Math.min(headerSize + view.getUint32(4, true), bytes.length);
  const definitions = new Map<number, MessageDefinition>();
  const points: Point[] = [];
  let position = headerSize;

  while (position < end) {
    const recordHeader = bytes[position++];
    const compressed = (recordHeader & 0x80) !== 0;
    const localType = compressed ? (recordHeader >> 5) & 0x03 : recordHeader & 0x0f;
    const isDefinition = !compressed && (recordHeader & 0x40) !== 0;
    const hasDeveloperFields = !compressed && (recordHeader & 0x20) !== 0;

    if (isDefinition) {
      requireBytes(position, 5, end);
      position++;
      const littleEndian = bytes[position++] === 0;
      const globalNumber = view.getUint16(position, littleEndian);
      position += 2;
      const fieldCount = bytes[position++];
      requireBytes(position, fieldCount * 3, end);
      const fields: FieldDefinition[] = [];
      for (let index = 0; index < fieldCount; index++) {
        fields.push({ number: bytes[position], size: bytes[position + 1], baseType: bytes[position + 2] });
        position += 3;
      }
      if (hasDeveloperFields) {
        requireBytes(position, 1, end);
        const count = bytes[position++];
        requireBytes(position, count * 3, end);
        position += count * 3;
      }
      definitions.set(localType, { globalNumber, littleEndian, fields });
      continue;
    }

    const definition = definitions.get(localType);
    if (!definition) throw new Error(`Unknown FIT local message ${localType}`);
    let lat: number | null = null;
    let lng: number | null = null;
    for (const field of definition.fields) {
      requireBytes(position, field.size, end);
      if (definition.globalNumber === 20 && (field.number === 0 || field.number === 1)) {
        const value = readSint32(view, position, field, definition.littleEndian);
        if (field.number === 0) lat = value;
        if (field.number === 1) lng = value;
      }
      position += field.size;
    }
    if (lat !== null && lng !== null && lat !== INVALID_SINT32 && lng !== INVALID_SINT32) {
      points.push([lat * SEMICIRCLE_TO_DEGREES, lng * SEMICIRCLE_TO_DEGREES]);
    }
  }
  return points;
}

function readSint32(view: DataView, offset: number, field: FieldDefinition, littleEndian: boolean): number | null {
  const baseType = field.baseType & 0x1f;
  if (BASE_TYPE_SIZE[baseType] !== 4 || field.size < 4) return null;
  return view.getInt32(offset, littleEndian);
}

function requireBytes(position: number, length: number, end: number): void {
  if (position + length > end) throw new Error("Truncated FIT message");
}

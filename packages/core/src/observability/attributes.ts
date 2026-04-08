/**
 * Attribute normalization for trace records.
 *
 * Converts arbitrary span attribute values into JSON-safe primitives,
 * handling Maps, Sets, Dates, Errors, BigInts, and circular references.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function markSeen(value: object, seen: WeakSet<object>): boolean {
  if (seen.has(value)) return true;
  seen.add(value);
  return false;
}

function normalizeJsonValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (Array.isArray(value)) {
    if (markSeen(value, seen)) return "[Circular]";
    return value.map((entry) => normalizeJsonValue(entry, seen));
  }
  if (value instanceof Map) {
    if (markSeen(value, seen)) return "[Circular]";
    return Object.fromEntries(
      Array.from(value.entries(), ([key, entryValue]) => [
        String(key),
        normalizeJsonValue(entryValue, seen),
      ])
    );
  }
  if (value instanceof Set) {
    if (markSeen(value, seen)) return "[Circular]";
    return Array.from(value.values(), (entry) =>
      normalizeJsonValue(entry, seen)
    );
  }
  if (!isPlainObject(value)) return String(value);
  if (markSeen(value, seen)) return "[Circular]";
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      normalizeJsonValue(entryValue, seen),
    ])
  );
}

/** Strip `undefined` values and normalize all attribute values for JSON serialization. */
export function compactTraceAttributes(
  attributes: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, normalizeJsonValue(value)])
  );
}

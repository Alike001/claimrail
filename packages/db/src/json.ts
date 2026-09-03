export type JsonSafe = null | boolean | number | string | JsonSafe[] | { [key: string]: JsonSafe };

export function toJsonSafe(value: unknown): JsonSafe {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite numbers cannot be stored as JSON");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    const output: Record<string, JsonSafe> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) output[key] = toJsonSafe(child);
    }
    return output;
  }
  throw new TypeError(`unsupported JSON value: ${typeof value}`);
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  const safe = toJsonSafe(value);
  if (safe === null || Array.isArray(safe) || typeof safe !== "object") {
    throw new TypeError("expected a JSON object");
  }
  return safe;
}

import { invoke } from "@tauri-apps/api/core";

export interface V2CommandEnvelope<T> {
  status: "ok" | "error";
  data: T | null;
  error: string | null;
  code: string | null;
  correlationId: string | null;
}

function isEnvelope<T>(value: unknown): value is V2CommandEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.status === "string" &&
    Object.prototype.hasOwnProperty.call(v, "data") &&
    Object.prototype.hasOwnProperty.call(v, "error") &&
    Object.prototype.hasOwnProperty.call(v, "code") &&
    Object.prototype.hasOwnProperty.call(v, "correlationId")
  );
}

/**
 * Compatibility invoke layer:
 * - v1: returns raw payload directly
 * - v2: returns { status, data, error, code, correlationId }
 */
export async function invokeCompat<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const result = await invoke<unknown>(command, args);

  if (!isEnvelope<T>(result)) {
    return result as T;
  }

  if (result.status === "ok") {
    return result.data as T;
  }

  const suffix = result.correlationId ? ` (correlationId=${result.correlationId})` : "";
  throw new Error(`${result.error ?? "Unknown command error"}${suffix}`);
}

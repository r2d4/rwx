import { isRecord, isString } from "./guards.ts";

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (error: Error): Result<never> => ({ ok: false, error });

export const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  if (isString(value)) {
    return new Error(value);
  }
  if (isRecord(value)) {
    const message = isString(value.message) ? value.message : "Unknown error";
    return new Error(message);
  }
  return new Error("Unknown error");
};

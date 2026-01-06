import { isRecord, isString } from "./guards.ts";

export type ErrnoException = Error & { code?: string };

export const isErrnoException = (value: unknown): value is ErrnoException => {
  if (!(value instanceof Error)) {
    return false;
  }
  if (!isRecord(value)) {
    return false;
  }
  const codeValue = value.code;
  return codeValue === undefined || isString(codeValue);
};

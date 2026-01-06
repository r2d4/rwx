export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === "object" && value !== null;
};

export const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

export const getRecordValue = (
  record: UnknownRecord,
  key: string,
): unknown => {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
};

export const getStringValue = (
  record: UnknownRecord,
  key: string,
): string | null => {
  const value = getRecordValue(record, key);
  return isString(value) ? value : null;
};

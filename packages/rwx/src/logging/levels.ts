import type { LogLevel } from "../model.ts";

const order: LogLevel[] = ["debug", "info", "warn", "error"];

export const normalizeLevel = (level: string): LogLevel => {
  const lower = level.toLowerCase();
  if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error") {
    return lower;
  }
  return "info";
};

export const allowsLevel = (current: LogLevel, target: LogLevel): boolean => {
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) {
    return target !== "debug";
  }
  return targetIndex >= currentIndex;
};

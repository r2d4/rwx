import { appendFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { LogFormat, LogLevel } from "../model.ts";
import { err, ok, toError, type Result } from "../shared/result.ts";
import { allowsLevel, normalizeLevel } from "./levels.ts";

export type SessionLogger = {
  info: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  warn: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  error: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  debug: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  setLevel: (level: string) => void;
  maybeRotate: (nextPath: string) => Promise<Result<boolean>>;
  format: LogFormat;
  path: () => string;
};

const levelLabel: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

export const createSessionLogger = async (opts: {
  path: string;
  format: LogFormat;
}): Promise<Result<SessionLogger>> => {
  if (opts.path.length === 0) {
    return err(new Error("log path is empty"));
  }
  let currentPath = opts.path;
  let level: LogLevel = "info";
  const format = opts.format.length === 0 ? "text" : opts.format;

  const ensureDir = async (value: string): Promise<Result<void>> => {
    const dir = path.dirname(value);
    if (dir.length === 0) {
      return ok(undefined);
    }
    const mkdirResult = await mkdir(dir, { recursive: true })
      .then(() => ok(undefined))
      .catch((error) => err(toError(error)));
    return mkdirResult;
  };

  const writeLine = async (line: string): Promise<Result<void>> => {
    const ensureResult = await ensureDir(currentPath);
    if (!ensureResult.ok) {
      return ensureResult;
    }
    return appendFile(currentPath, line)
      .then(() => ok(undefined))
      .catch((error) => err(toError(error)));
  };

  const write = async (
    levelValue: LogLevel,
    message: string,
    meta: Record<string, unknown>,
  ): Promise<Result<void>> => {
    if (!allowsLevel(level, levelValue)) {
      return ok(undefined);
    }
    const ts = new Date().toISOString();
    if (format === "json") {
      const payload: Record<string, unknown> = {
        ts,
        level: levelLabel[levelValue],
        msg: message,
      };
      for (const [key, value] of Object.entries(meta)) {
        if (value !== undefined) {
          payload[key] = value;
        }
      }
      const json = JSON.stringify(payload);
      return writeLine(`${json}\n`);
    }
    const humanTs = new Date().toLocaleString("en-US", { timeZoneName: "short" });
    const entries = Object.entries(meta)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const suffix = entries.length
      ? ` ${entries.map(([k, v]) => `${k}=${String(v)}`).join(" ")}`
      : "";
    const line = `${humanTs} [${levelLabel[levelValue]}] ${message}${suffix}\n`;
    return writeLine(line);
  };

  const maybeRotate = async (nextPath: string): Promise<Result<boolean>> => {
    if (nextPath.length === 0 || nextPath === currentPath) {
      return ok(false);
    }
    const ensureResult = await ensureDir(nextPath);
    if (!ensureResult.ok) {
      return ensureResult;
    }
    const renameResult = await rename(currentPath, nextPath)
      .then(() => ok(true))
      .catch((error) => err(toError(error)));
    if (!renameResult.ok) {
      return renameResult;
    }
    currentPath = nextPath;
    return ok(true);
  };

  return ok({
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    debug: (message, meta) => write("debug", message, meta),
    setLevel: (next) => {
      level = normalizeLevel(next);
    },
    maybeRotate,
    format,
    path: () => currentPath,
  });
};

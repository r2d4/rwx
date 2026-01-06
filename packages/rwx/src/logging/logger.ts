import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LogFormat, LogLevel } from "../model.ts";
import { err, ok, toError, type Result } from "../shared/result.ts";
import { allowsLevel, normalizeLevel } from "./levels.ts";

export type LogMeta = Record<string, unknown>;

export type Logger = {
  info: (message: string, meta: LogMeta) => Promise<Result<void>>;
  warn: (message: string, meta: LogMeta) => Promise<Result<void>>;
  error: (message: string, meta: LogMeta) => Promise<Result<void>>;
  debug: (message: string, meta: LogMeta) => Promise<Result<void>>;
  setLevel: (level: string) => void;
  format: LogFormat;
  path: string;
};

const levelLabel: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

export const createFileLogger = async (opts: {
  path: string;
  format: LogFormat;
}): Promise<Result<Logger>> => {
  const logPath = opts.path;
  if (logPath.length === 0) {
    return err(new Error("log path is empty"));
  }
  const format = opts.format.length === 0 ? "text" : opts.format;
  const dir = path.dirname(logPath);
  const mkdirResult = await mkdir(dir, { recursive: true })
    .then(() => ok(undefined))
    .catch((error) => err(toError(error)));
  if (!mkdirResult.ok) {
    return mkdirResult;
  }

  let level: LogLevel = "info";

  const writeLine = async (line: string): Promise<Result<void>> => {
    return appendFile(logPath, line)
      .then(() => ok(undefined))
      .catch((error) => err(toError(error)));
  };

  const write = async (
    levelValue: LogLevel,
    message: string,
    meta: LogMeta,
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

  const logger: Logger = {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    debug: (message, meta) => write("debug", message, meta),
    setLevel: (next) => {
      level = normalizeLevel(next);
    },
    format,
    path: logPath,
  };

  return ok(logger);
};

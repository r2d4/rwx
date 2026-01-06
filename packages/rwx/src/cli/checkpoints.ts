import path from "node:path";
import { createCheckpointer, type CheckpointRef } from "../checkpoint/checkpointer.ts";
import { resolveRepoRoot } from "../shared/paths.ts";
import { runCommand } from "../shared/exec.ts";
import { err, ok, type Result } from "../shared/result.ts";

export const listCheckpoints = async (opts: {
  session: string | null;
  json: boolean;
}): Promise<Result<void>> => {
  const repoResult = await resolveRepoRoot();
  if (!repoResult.ok) {
    return repoResult;
  }
  const checkpointer = createCheckpointer(repoResult.value);
  const result = await checkpointer.list(null);
  if (!result.ok) {
    return result;
  }
  const sessions = collectSessions(result.value);
  const resolvedSession = opts.session
    ? resolveSessionPrefix(opts.session, sessions)
    : ok(null);
  if (!resolvedSession.ok) {
    return resolvedSession;
  }
  if (resolvedSession.value) {
    const filtered = result.value.filter(
      (ref) => ref.sessionId === resolvedSession.value,
    );
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
      return ok(undefined);
    }
    for (const ref of filtered) {
      process.stdout.write(formatFullMetadata(ref));
      process.stdout.write("\n");
    }
    return ok(undefined);
  }
  const repoName = path.basename(repoResult.value);
  const nowMs = Date.now();
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
    return ok(undefined);
  }
  for (const session of sessions) {
    const shortId = session.sessionId.length > 0 ? session.sessionId.slice(0, 6) : "------";
    const count = session.count.toString();
    const relative = formatRelativeTime(session.lastTimestampMs, nowMs);
    const absolute = session.lastTimestampMs ? formatShortDate(session.lastTimestampMs) : "-";
    const when =
      relative !== "-" && absolute !== "-"
        ? `${relative} (${absolute})`
        : relative !== "-"
          ? relative
          : absolute;
    const folder = repoName.length > 0 ? repoName : repoResult.value;
    process.stdout.write(
      `${color.bold(color.cyan(shortId))} ${color.dim(`(${count})`)} ${color.green(when)} ${color.dim(folder)}\n`,
    );
  }
  return ok(undefined);
};

export const useCheckpoint = async (opts: {
  ref: string;
  sessionId: string | null;
}): Promise<Result<void>> => {
  const repoResult = await resolveRepoRoot();
  if (!repoResult.ok) {
    return repoResult;
  }
  const checkpointer = createCheckpointer(repoResult.value);
  const listResult = await checkpointer.list(null);
  if (!listResult.ok) {
    return listResult;
  }
  const sessions = collectSessions(listResult.value);
  const resolvedSession = opts.sessionId
    ? resolveSessionPrefix(opts.sessionId, sessions)
    : ok(null);
  if (!resolvedSession.ok) {
    return resolvedSession;
  }
  const resolvedRef = resolveCheckpointRef(opts.ref, resolvedSession.value);
  if (!resolvedRef.ok) {
    return resolvedRef;
  }
  const checkout = await runCommand({
    command: "git",
    args: ["checkout", resolvedRef.value],
    cwd: repoResult.value,
    env: process.env,
    timeoutMs: 0,
    onStdout: (chunk) => process.stdout.write(chunk),
    onStderr: (chunk) => process.stderr.write(chunk),
  });
  if (!checkout.ok) {
    return checkout;
  }
  if (checkout.value.exitCode !== 0) {
    return err(new Error("git checkout failed"));
  }
  return ok(undefined);
};

const formatFullMetadata = (ref: CheckpointRef): string => {
  const ts = ref.timestamp.length > 0 ? ref.timestamp : "-";
  const sid = ref.sessionId.length > 0 ? ref.sessionId : "-";
  const verifyExit = ref.verifyMode.length > 0 ? String(ref.verifyExitCode) : "-";
  const verifyMode = ref.verifyMode.length > 0 ? ref.verifyMode : "-";
  const verifyMsg = ref.verifyOutput.length > 0 ? ref.verifyOutput : "-";
  return (
    `iter: ${ref.iteration.toString().padStart(4, "0")}\n` +
    `sha: ${ref.shortSha}\n` +
    `timestamp: ${ts}\n` +
    `session: ${sid}\n` +
    `verify_exit: ${verifyExit}\n` +
    `verify_mode: ${verifyMode}\n` +
    `verify_output: ${verifyMsg}\n` +
    `ref: ${ref.ref}\n`
  );
};

const collectSessions = (
  refs: CheckpointRef[],
): Array<{ sessionId: string; count: number; lastTimestampMs: number | null }> => {
  const sessions: Array<{ sessionId: string; count: number; lastTimestampMs: number | null }> = [];
  let current: { sessionId: string; count: number; lastTimestampMs: number | null } | null = null;
  for (const ref of refs) {
    const sid = ref.sessionId ?? "";
    if (!current || current.sessionId !== sid) {
      current = { sessionId: sid, count: 0, lastTimestampMs: null };
      sessions.push(current);
    }
    current.count += 1;
    const tsMs = parseTimestampMs(ref.timestamp);
    if (tsMs !== null) {
      if (current.lastTimestampMs === null || tsMs > current.lastTimestampMs) {
        current.lastTimestampMs = tsMs;
      }
    }
  }
  return sessions;
};

const resolveSessionPrefix = (
  prefix: string,
  sessions: Array<{ sessionId: string }>,
): Result<string> => {
  if (!prefix) {
    return err(new Error("session id is required"));
  }
  const matches = sessions
    .map((session) => session.sessionId)
    .filter((id) => id.startsWith(prefix));
  if (matches.length === 0) {
    return err(new Error(`no session matches prefix: ${prefix}`));
  }
  if (matches.length > 1) {
    return err(new Error(`session prefix is ambiguous: ${prefix}`));
  }
  return ok(matches[0]);
};

const resolveCheckpointRef = (
  input: string,
  sessionId: string | null,
): Result<string> => {
  if (input.startsWith("refs/")) {
    return ok(input);
  }
  if (input.includes("/")) {
    return ok(`refs/rwx/${input}`);
  }
  if (!sessionId) {
    return err(new Error("session id is required for bare iteration ref"));
  }
  const iter = input.toString().padStart(4, "0");
  return ok(`refs/rwx/${sessionId}/iter-${iter}`);
};

const useColor = process.stdout.isTTY;

const color = {
  bold: (value: string) => (useColor ? `\u001b[1m${value}\u001b[0m` : value),
  dim: (value: string) => (useColor ? `\u001b[2m${value}\u001b[0m` : value),
  cyan: (value: string) => (useColor ? `\u001b[36m${value}\u001b[0m` : value),
  green: (value: string) => (useColor ? `\u001b[32m${value}\u001b[0m` : value),
  yellow: (value: string) => (useColor ? `\u001b[33m${value}\u001b[0m` : value),
};

const parseTimestampMs = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatShortDate = (ms: number): string => {
  const date = new Date(ms);
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${month} ${day} ${hour}:${minute}`;
};

const formatRelativeTime = (ms: number | null, nowMs: number): string => {
  if (!ms) {
    return "-";
  }
  const diffMs = Math.max(0, nowMs - ms);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
};

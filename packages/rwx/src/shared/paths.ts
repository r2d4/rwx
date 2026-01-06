import os from "node:os";
import path from "node:path";
import { runCommand } from "./exec.ts";
import { err, ok, type Result } from "./result.ts";

export const resolveRepoRoot = async (): Promise<Result<string>> => {
  const result = await runCommand({
    command: "git",
    args: ["rev-parse", "--show-toplevel"],
    cwd: null,
    env: null,
    timeoutMs: 0,
    onStdout: null,
    onStderr: null,
  });
  if (!result.ok) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return err(new Error("git rev-parse failed"));
  }
  const root = result.value.stdout.trim();
  if (root.length === 0) {
    return err(new Error("git rev-parse returned empty"));
  }
  return ok(root);
};

export const resolveWorkspaceRoot = async (): Promise<
  Result<{ root: string; inGit: boolean }>
> => {
  const repoRoot = await resolveRepoRoot();
  if (repoRoot.ok) {
    return ok({ root: repoRoot.value, inGit: true });
  }
  const cwd = process.cwd();
  return ok({ root: cwd, inGit: false });
};

export const resolvePath = (root: string, value: string): string => {
  if (value.length === 0) {
    return value;
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(root, value);
};

export const rwxHomeDir = (): string => path.join(os.homedir(), ".rwx");

export const rwxLogsDir = (): string => path.join(rwxHomeDir(), "logs");

export const defaultLogPath = (
  sessionId: string,
  label: string,
): string => {
  const name = label.length > 0 ? `${sessionId}-${label}` : sessionId;
  return path.join(rwxLogsDir(), `${name}.log`);
};

export const tempLogPath = (label: string): string => {
  const name = label.length > 0 ? `pending-${label}` : "pending";
  return path.join(rwxLogsDir(), `${name}.log`);
};

import type { RunConfig, SessionState, VerifyResult } from "../model.ts";
import { runCommand } from "../shared/exec.ts";
import { err, ok, type Result } from "../shared/result.ts";

const tail = (value: string, max: number): string => {
  if (max <= 0 || value.length <= max) {
    return value;
  }
  return value.slice(value.length - max);
};

export const runCommandVerify = async (
  cfg: RunConfig,
  _session: SessionState,
  outputWriter: ((chunk: string) => void) | null,
): Promise<Result<VerifyResult>> => {
  if (!cfg.verifyCmd || cfg.verifyCmd.trim().length === 0) {
    return err(new Error("verify command is empty"));
  }
  const shell = cfg.verifyShell.trim();
  if (shell.length === 0) {
    return err(new Error("verify shell is empty"));
  }
  const result = await runCommand({
    command: shell,
    args: ["-lc", cfg.verifyCmd],
    cwd: null,
    env: null,
    timeoutMs: cfg.verifyTimeoutSec > 0 ? cfg.verifyTimeoutSec * 1000 : 0,
    onStdout: outputWriter,
    onStderr: outputWriter,
  });
  if (!result.ok) {
    return result;
  }
  const output = `${result.value.stdout}${result.value.stderr}`;
  const verify: VerifyResult = {
    exitCode: result.value.exitCode,
    timedOut: result.value.timedOut,
    outputTail: tail(output, 4096),
  };
  return ok(verify);
};
